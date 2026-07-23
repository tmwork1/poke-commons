/**
 * Phase 2-5: jpoke ネイティブ実行 vs ブラウザ内Pyodide実行の等価性回帰テスト。
 *
 * `tests/e2e/fixtures/cases.json` の各ケースについて、`tests/e2e/fixtures/expected.json`
 * (tests/e2e/fixtures/generate_expected.py でネイティブ jpoke 実行して事前生成した固定値)
 * と、実ブラウザ (Chromium) 上の `src/lib/pyodide-engine.ts` (`calcDamages()`) の実行結果を
 * 完全一致で比較する。
 *
 * Pyodideの初期化は重い(wasm読み込み + wheel インストール)ため、1ページ・1回の初期化を
 * 全ケースで使い回す(同一ページ内での複数回計算がシングルトン化されている
 * `src/lib/pyodide-engine.ts` の設計とも一致する)。
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// pyodide-engine.ts はブラウザ専用モジュールのため実行時にはimportせず、型情報のみ拝借する。
import type { PokemonSpec, FieldSpec, CalcDamagesOptions, CalcDamagesResult } from "../../src/lib/pyodide-engine";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

interface FixtureCase {
  id: string;
  description: string;
  attacker: PokemonSpec;
  defender: PokemonSpec;
  moveName: string;
  seed?: number;
  critical?: boolean;
  field?: FieldSpec;
  maxLethalAttackCount?: number;
}

const cases: FixtureCase[] = JSON.parse(
  readFileSync(path.join(fixturesDir, "cases.json"), "utf-8"),
);
const expected: Record<string, CalcDamagesResult> = JSON.parse(
  readFileSync(path.join(fixturesDir, "expected.json"), "utf-8"),
);

declare global {
  interface Window {
    __pyodideEngine__: {
      init: () => Promise<{ status: string; message: string }>;
      calc: (
        attacker: PokemonSpec,
        defender: PokemonSpec,
        moveName: string,
        options?: CalcDamagesOptions,
      ) => Promise<CalcDamagesResult>;
      isReady: () => boolean;
    };
  }
}

async function initHarness(page: Page): Promise<void> {
  await page.goto("/e2e-test-harness");
  await page.waitForFunction(() => typeof window.__pyodideEngine__ !== "undefined");
  // Pyodideランタイム + jpoke wheel のロードは重い(初回は十数秒かかることがある)ため、
  // このawait自体はPlaywrightのデフォルトタイムアウトを持たない(呼び出し側のテストの
  // test.setTimeout()で全体の上限を確保する)。
  await page.evaluate(() => window.__pyodideEngine__.init());
}

test.describe("ダメージ計算: ブラウザ(Pyodide) vs jpokeネイティブ実行の等価性", () => {
  test.beforeAll(() => {
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(expected[c.id], `expected.json に ${c.id} の期待値がありません。generate_expected.py を実行してください。`).toBeDefined();
    }
  });

  test("代表パターン全件がネイティブjpoke実行結果と完全一致する", async ({ page }) => {
    // Pyodide初期化(数秒〜十数秒) + 10ケース分の計算をこのテスト内で直列実行するため、
    // playwright.config.ts の既定値(120秒)より長めに確保する。
    test.setTimeout(180_000);
    await initHarness(page);

    for (const testCase of cases) {
      await test.step(`${testCase.id}: ${testCase.description}`, async () => {
        const options: CalcDamagesOptions = {
          seed: testCase.seed,
          critical: testCase.critical,
          field: testCase.field,
          maxLethalAttackCount: testCase.maxLethalAttackCount,
        };

        const result = await page.evaluate(
          ({ attacker, defender, moveName, options }) =>
            window.__pyodideEngine__.calc(attacker, defender, moveName, options),
          { attacker: testCase.attacker, defender: testCase.defender, moveName: testCase.moveName, options },
        );

        expect(result.damages, `${testCase.id}: damages配列がネイティブ実行結果と不一致`).toEqual(
          expected[testCase.id].damages,
        );
        expect(result.lethal, `${testCase.id}: lethal配列がネイティブ実行結果と不一致`).toEqual(
          expected[testCase.id].lethal,
        );
      });
    }
  });
});
