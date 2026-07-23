/**
 * Pyodide + jpoke によるブラウザ内ダメージ計算エンジン。
 *
 * **クライアント専用モジュール**。Astro の SSR (フロントマター / API routes /
 * middleware.ts / worker.ts) から import しないこと。`<script>` タグ経由で
 * ブラウザにだけバンドル・実行されることを前提にしている
 * (Cloudflare Workers ランタイムには `window`/`document` が無いため、
 * サーバー側で読み込むと即座に失敗する)。
 *
 * 設計方針(開発プラン Phase 1-7):
 * - 遅延初期化: モジュールを読み込んだだけでは何も起こらない。`initEngine()` を
 *   明示的に呼んで初めて Pyodide のロードが始まる(ページ読み込み時の自動初期化はしない)。
 * - シングルトン化: 初期化 Promise をモジュールスコープに保持し、`initEngine()` を
 *   何度呼んでも実際の初期化処理(pyodide.js 読み込み・loadPyodide・wheel インストール)
 *   は1回しか走らない。2回目以降は同じ Promise を返すだけなので、同一ページ内で
 *   計算をやり直しても再初期化は発生しない。
 * - 進捗購読: `initEngine(onProgress)` の `onProgress` は複数回・複数箇所から
 *   登録可能なリスナーとして扱う。登録した瞬間に現在の状態を1回通知する
 *   (途中から購読しても現在地を把握できるようにするため)。
 *
 * - オフラインキャッシュ: `registerOfflineCache()` で `public/pyodide-sw.js` を登録すると、
 *   Pyodide CDN (`cdn.jsdelivr.net/pyodide/`) と jpoke wheel (`/master-data/pyodide/`) への
 *   GETリクエストのみが Service Worker の Cache Storage に cache-first で保存される。
 *   初回訪問時はSWのインストール完了までは通常どおりネットワークから取得するが、
 *   2回目以降のページ再読み込みでは同一オリジン内でキャッシュヒットし、再ダウンロードを回避できる。
 */

// Pyodide本体はCDNから読み込む(PoC: poc/pyodide-jpoke/index.html と同じCDN・バージョン)。
// 将来 Service Worker でオフラインキャッシュする際は、このURLをキャッシュ対象に含める。
const PYODIDE_VERSION = "v0.26.4";
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const PYODIDE_SCRIPT_URL = `${PYODIDE_CDN_BASE}pyodide.js`;

// build:master-data (scripts/build-master-data/build.mjs) が生成する静的アセット。
// public/ 配下はAstroが素通しで配信するため、このパスがそのままURLになる。
const JPOKE_WHEEL_URL = "/master-data/pyodide/wheels/jpoke-0.2.0-py3-none-any.whl";

// public/pyodide-sw.js: Pyodide CDN + jpoke wheel のみを対象にした cache-first Service Worker。
const SERVICE_WORKER_URL = "/pyodide-sw.js";

export type EngineStatus = "idle" | "loading" | "ready" | "error";

export interface EngineProgress {
  status: EngineStatus;
  message: string;
}

export type ProgressListener = (progress: EngineProgress) => void;

/**
 * ダメージ計算に必要な最小限のポケモン仕様。
 * 本格的なフォーム(努力値・性格などの入力UI一式)はPhase 2で作る。
 * ここではエンジンの疎通確認に必要な項目のみ扱う。
 */
export interface PokemonSpec {
  /** ポケモン名 (jpoke の日本語キー。例: "ピカチュウ") */
  name: string;
  level?: number;
  /** 性格 (例: "いじっぱり")。省略時は "まじめ" */
  nature?: string;
  gender?: "" | "male" | "female";
  abilityName?: string;
  itemName?: string;
  /** 覚えている技名一覧。省略時は calcDamages() の moveName のみを持たせる */
  moveNames?: string[];
  teraType?: string | null;
  /** 努力値 (Champions形式 0〜32) [HP, 攻撃, 防御, 特攻, 特防, 素早さ] */
  evs?: number[];
  /** 個体値 [HP, 攻撃, 防御, 特攻, 特防, 素早さ]。省略時は全て31 */
  ivs?: number[];
}

export interface CalcDamagesOptions {
  /** 乱数シード。省略時はjpoke側で毎回ランダムに決定される(結果は非決定的になる) */
  seed?: number;
  /** 急所固定で計算するか */
  critical?: boolean;
}

export interface CalcDamagesResult {
  /** 乱数16段階を考慮した、あり得るダメージ値の一覧 */
  damages: number[];
}

// --- Pyodide型の最小定義(公式の型パッケージを追加導入せずに済ませるための最小限のもの) ---
interface PyProxy {
  toString(): string;
  destroy(): void;
  [key: string]: unknown;
}

interface PyodideInterface {
  loadPackage(names: string | string[]): Promise<void>;
  pyimport(name: string): { install(pkg: string): Promise<void> };
  runPythonAsync(code: string): Promise<unknown>;
  globals: { get(name: string): unknown };
  toPy(obj: unknown): PyProxy;
}

declare global {
  interface Window {
    loadPyodide?: (options?: { indexURL: string }) => Promise<PyodideInterface>;
  }
}

type CalcDamagesJsonFn = (
  attackerSpec: PyProxy,
  defenderSpec: PyProxy,
  moveName: string,
  seed: number | null,
  critical: boolean,
) => string;

// --- モジュールスコープの状態(シングルトン) ---
let pyodideSingleton: PyodideInterface | null = null;
let calcDamagesJsonFn: CalcDamagesJsonFn | null = null;
let initPromise: Promise<PyodideInterface> | null = null;
let currentStatus: EngineStatus = "idle";
let currentMessage = "未初期化";
const listeners = new Set<ProgressListener>();

function notify(status: EngineStatus, message: string): void {
  currentStatus = status;
  currentMessage = message;
  for (const listener of listeners) {
    listener({ status, message });
  }
}

/** 現在の初期化状態を購読なしで取得したい場合用。 */
export function getEngineProgress(): EngineProgress {
  return { status: currentStatus, message: currentMessage };
}

/**
 * Pyodideコア一式・jpoke wheel のオフラインキャッシュ用 Service Worker を登録する。
 *
 * `initEngine()` とは独立した処理で、Pyodide自体のロードは一切開始しない
 * (ページ読み込み時に呼んでも遅延初期化方針に反しない)。ブラウザが
 * Service Worker 未対応の場合は何もしない。登録は一度で十分なため、
 * ページ読み込みごとに呼んでも `register()` が冪等に処理する。
 */
export function registerOfflineCache(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn("Service Workerの登録に失敗しました:", err);
  });
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (window.loadPyodide) {
        // 既に読み込み完了済み。
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error(`スクリプトの読み込みに失敗しました: ${src}`)),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new Error(`スクリプトの読み込みに失敗しました: ${src}`)),
    );
    document.head.appendChild(script);
  });
}

/**
 * jpoke のインポートとダメージ計算ヘルパーを定義する固定Pythonコード。
 *
 * 重要: この文字列はビルド時に確定した固定コードであり、ユーザー入力を
 * 文字列結合することは絶対にしない。実際の計算対象(ポケモン名・技名・
 * 努力値など、すべてユーザー由来の値になり得るデータ)は、この関数定義後に
 * `calc_damages_json()` の**引数**として `pyodide.toPy()` 経由のPythonオブジェクト
 * で渡す。これによりコードインジェクションの経路を断つ。
 */
const BOOTSTRAP_PYTHON = `
import json
from jpoke import Battle, Player, Pokemon


def _build_pokemon(spec, fallback_move_name):
    move_names = spec.get("moveNames") or None
    if not move_names:
        move_names = [fallback_move_name] if fallback_move_name else ["はねる"]

    level = spec.get("level")
    pokemon = Pokemon(
        spec["name"],
        gender=spec.get("gender") or "",
        nature=spec.get("nature") or "まじめ",
        level=level if level is not None else 50,
        ability_name=spec.get("abilityName") or "",
        item_name=spec.get("itemName") or "",
        move_names=list(move_names),
        tera_type=spec.get("teraType") or None,
    )

    evs = spec.get("evs")
    if evs is not None:
        pokemon.set_evs(list(evs))
    ivs = spec.get("ivs")
    if ivs is not None:
        pokemon.set_ivs(list(ivs))

    return pokemon


def calc_damages_json(attacker_spec, defender_spec, move_name, seed, critical):
    player1 = Player("Attacker")
    attacker = _build_pokemon(attacker_spec, move_name)
    player1.team.append(attacker)

    player2 = Player("Defender")
    defender = _build_pokemon(defender_spec, None)
    player2.team.append(defender)

    battle = Battle(player1, player2, seed=seed)
    battle.start()

    active_attacker, active_defender = battle.actives
    move = next(
        (m for m in active_attacker.moves if m.name == move_name),
        active_attacker.moves[0],
    )
    damages = battle.calc_damages(active_attacker, active_defender, move, critical=critical)
    return json.dumps({"damages": damages})
`;

/**
 * Pyodide + jpoke を初期化する(遅延初期化・シングルトン)。
 *
 * - 1回目の呼び出しでのみ実際のロード処理を開始する。
 * - 2回目以降の呼び出し(ロード中・完了後いずれも)は、新規の初期化を
 *   行わず既存の Promise をそのまま返す。
 * - `onProgress` を渡すと、以後の状態変化(loading の各段階・ready・error)を
 *   通知するリスナーとして登録される。登録直後に現在の状態を1回通知するため、
 *   初期化開始後に途中から購読しても現在地を把握できる。
 *
 * @param onProgress 進捗通知コールバック(省略可)
 */
export function initEngine(onProgress?: ProgressListener): Promise<PyodideInterface> {
  if (onProgress) {
    listeners.add(onProgress);
    onProgress({ status: currentStatus, message: currentMessage });
  }

  if (initPromise) {
    // 既に初期化が開始済み(進行中 or 完了)。再初期化はしない。
    return initPromise;
  }

  initPromise = (async (): Promise<PyodideInterface> => {
    try {
      notify("loading", "Pyodideランタイムをロード中...");
      await loadScriptOnce(PYODIDE_SCRIPT_URL);
      if (!window.loadPyodide) {
        throw new Error(
          "loadPyodideが見つかりません(pyodide.jsの読み込みに失敗した可能性があります)",
        );
      }
      const pyodide = await window.loadPyodide({ indexURL: PYODIDE_CDN_BASE });

      notify("loading", "micropipをロード中...");
      await pyodide.loadPackage("micropip");

      notify("loading", "jpoke (wheel) をインストール中...");
      const micropip = pyodide.pyimport("micropip");
      await micropip.install(JPOKE_WHEEL_URL);

      notify("loading", "jpokeの計算ヘルパーを準備中...");
      await pyodide.runPythonAsync(BOOTSTRAP_PYTHON);
      calcDamagesJsonFn = pyodide.globals.get("calc_damages_json") as CalcDamagesJsonFn;

      pyodideSingleton = pyodide;
      notify("ready", "初期化完了");
      return pyodide;
    } catch (err) {
      // 失敗時はシングルトンをリセットし、次回 initEngine() 呼び出しで再試行できるようにする。
      initPromise = null;
      pyodideSingleton = null;
      calcDamagesJsonFn = null;
      const message = err instanceof Error ? err.message : String(err);
      notify("error", `エラー: ${message}`);
      throw err;
    }
  })();

  return initPromise;
}

/** 初期化済み(ready状態)かどうか。 */
export function isEngineReady(): boolean {
  return currentStatus === "ready" && pyodideSingleton !== null && calcDamagesJsonFn !== null;
}

/**
 * jpoke でダメージ計算を実行する。
 *
 * `initEngine()` が完了(ready)している必要がある。文字列結合でPythonコードを
 * 組み立てるのではなく、`pyodide.toPy()` で変換したPythonオブジェクトを
 * 固定のPython関数 (`calc_damages_json`) へ引数として渡す。
 */
export async function calcDamages(
  attackerSpec: PokemonSpec,
  defenderSpec: PokemonSpec,
  moveName: string,
  options: CalcDamagesOptions = {},
): Promise<CalcDamagesResult> {
  if (!pyodideSingleton || !calcDamagesJsonFn) {
    throw new Error("エンジンが初期化されていません。先に initEngine() を呼んでください。");
  }

  const pyodide = pyodideSingleton;
  const seed = options.seed ?? null;
  const critical = options.critical ?? false;

  const attackerPy = pyodide.toPy(attackerSpec);
  const defenderPy = pyodide.toPy(defenderSpec);
  try {
    const resultJson = calcDamagesJsonFn(attackerPy, defenderPy, moveName, seed, critical);
    return JSON.parse(resultJson) as CalcDamagesResult;
  } finally {
    // toPy() が生成したPythonオブジェクトはJS側で明示的に破棄する
    // (Pyodideのメモリ管理規約。破棄しないとPython側の参照が残りリークする)。
    attackerPy.destroy();
    defenderPy.destroy();
  }
}
