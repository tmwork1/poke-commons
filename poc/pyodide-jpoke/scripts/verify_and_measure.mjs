// Phase 0 検証スクリプト
// 1) ブラウザ(Pyodide)でのcalc_damages()結果とネイティブ実行結果の完全一致を確認
// 2) 通常回線での初回ロード時間・転送バイト数、スロットリング時の初回ロード時間、
//    キャッシュ有効時の2回目ロード時間を計測する
//
// 実行方法:
//   node scripts/verify_and_measure.mjs
// 事前に `python -m http.server 8000` などでこのディレクトリを配信しておくか、
// このスクリプト自身が http-server を起動する(下記参照)。

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = 8934;
const BASE_URL = `http://127.0.0.1:${PORT}/index.html`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".whl": "application/octet-stream",
  ".json": "application/json",
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      let filePath = path.join(ROOT, urlPath === "/" ? "/index.html" : urlPath);
      const st = await stat(filePath).catch(() => null);
      if (!st || !st.isFile()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(filePath);
      const body = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": body.length,
        // ブラウザキャッシュ挙動を検証したいので明示的にキャッシュ可能にする
        "Cache-Control": "public, max-age=31536000",
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

function getNativeResult() {
  const pythonExe =
    "C:\\Users\\tmtmp\\Documents\\pokemon\\jpoke\\.venv\\Scripts\\python.exe";
  const scriptPath = path.join(ROOT, "scripts", "native_calc.py");
  const out = execFileSync(pythonExe, [scriptPath], { encoding: "utf-8" });
  return out.trim();
}

async function waitForResult(page, timeoutMs = 120000) {
  await page.waitForFunction(
    () => window.__jpokeResult !== undefined || window.__jpokeError !== undefined,
    undefined,
    { timeout: timeoutMs }
  );
  const [result, error] = await page.evaluate(() => [
    window.__jpokeResult,
    window.__jpokeError,
  ]);
  if (error) throw new Error("ページ内でエラー: " + error);
  return result;
}

async function measureColdLoad(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const responses = [];
  page.on("response", async (res) => {
    try {
      const headers = res.headers();
      const lenHeader = headers["content-length"];
      let size = lenHeader ? Number(lenHeader) : null;
      if (size === null) {
        try {
          const body = await res.body();
          size = body.length;
        } catch {
          size = 0;
        }
      }
      responses.push({ url: res.url(), status: res.status(), size });
    } catch {
      // ignore
    }
  });

  const t0 = Date.now();
  await page.goto(BASE_URL, { waitUntil: "load" });
  const result = await waitForResult(page);
  const t1 = Date.now();

  await context.close();

  const totalBytes = responses.reduce((sum, r) => sum + (r.size || 0), 0);
  return {
    elapsedMs: t1 - t0,
    result,
    responses,
    totalBytes,
  };
}

async function measureThrottledLoad(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (1.5 * 1024 * 1024) / 8, // 1.5Mbps -> bytes/sec
    uploadThroughput: (750 * 1024) / 8, // 750kbps -> bytes/sec
    latency: 40, // ms
  });

  const t0 = Date.now();
  await page.goto(BASE_URL, { waitUntil: "load" });
  const result = await waitForResult(page, 180000);
  const t1 = Date.now();

  await context.close();
  return { elapsedMs: t1 - t0, result };
}

async function measureWarmLoad(browser) {
  // 同一コンテキストで2回ロードし、2回目(キャッシュ有効)の時間を計る
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: "load" });
  await waitForResult(page);

  // 2回目ロードで発生するネットワークリクエストを記録し、キャッシュ利用状況を確認する
  const requests = [];
  page.on("request", (req) => requests.push(req.url()));

  // 2回目ロード
  const t0 = Date.now();
  await page.goto(BASE_URL, { waitUntil: "load" });
  const result = await waitForResult(page);
  const t1 = Date.now();

  await context.close();
  return { elapsedMs: t1 - t0, result, requestCount: requests.length, requests };
}

async function main() {
  console.log("=== ネイティブ実行結果を取得 ===");
  const nativeResult = getNativeResult();
  console.log("native:", nativeResult);

  console.log("\n=== HTTPサーバー起動 ===");
  const server = await startServer();
  console.log(`listening on ${BASE_URL}`);

  const browser = await chromium.launch();

  try {
    console.log("\n=== 1) 通常回線での初回ロード計測 + 一致検証 ===");
    const cold = await measureColdLoad(browser);
    console.log(`初回ロード時間: ${cold.elapsedMs} ms`);
    console.log(`転送レスポンス数: ${cold.responses.length}`);
    console.log(`転送合計バイト数: ${cold.totalBytes} bytes (${(cold.totalBytes / 1024 / 1024).toFixed(2)} MB)`);
    console.log("--- レスポンス内訳(上位20件、サイズ降順) ---");
    const sorted = [...cold.responses].sort((a, b) => (b.size || 0) - (a.size || 0));
    for (const r of sorted.slice(0, 20)) {
      console.log(`${((r.size || 0) / 1024).toFixed(1).padStart(10)} KB  [${r.status}]  ${r.url}`);
    }
    console.log("browser result:", cold.result);

    const match = cold.result === nativeResult;
    console.log(`\n>>> 一致検証: ${match ? "完全一致 OK" : "不一致 NG"}`);
    if (!match) {
      console.log("native  :", nativeResult);
      console.log("browser :", cold.result);
    }

    console.log("\n=== 2) スロットリング条件(download1.5Mbps/upload750kbps/latency40ms)での初回ロード計測 ===");
    const throttled = await measureThrottledLoad(browser);
    console.log(`スロットリング下 初回ロード時間: ${throttled.elapsedMs} ms`);
    console.log("browser result:", throttled.result);
    console.log(`一致: ${throttled.result === nativeResult ? "OK" : "NG"}`);

    console.log("\n=== 3) キャッシュ有効時の2回目ロード計測(同一コンテキスト) ===");
    const warm = await measureWarmLoad(browser);
    console.log(`2回目ロード時間: ${warm.elapsedMs} ms`);
    console.log(`2回目ロード時のリクエスト数: ${warm.requestCount}`);
    console.log("browser result:", warm.result);
    console.log(`一致: ${warm.result === nativeResult ? "OK" : "NG"}`);

    console.log("\n=== サマリー ===");
    console.log(JSON.stringify({
      nativeResult,
      coldLoadMs: cold.elapsedMs,
      totalTransferBytes: cold.totalBytes,
      throttledLoadMs: throttled.elapsedMs,
      warmLoadMs: warm.elapsedMs,
      allMatch: match && throttled.result === nativeResult && warm.result === nativeResult,
    }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
