import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 2-5: E2E回帰テスト設定。
 *
 * `astro preview` はビルド済み `dist/` (Pyodideコア読み込みスクリプト・jpoke wheel を含む
 * 静的アセット一式) をそのまま配信するローカルサーバー。ビルド自体は
 * `npm run test:e2e` の `pretest:e2e` フック (`npm run build`) で事前に1回だけ行う
 * (`build:master-data` の wheel 再ビルドは分離venv作成を伴い数十秒かかるため、
 * webServer起動のたびに走らせるとタイムアウトしやすい)。
 * ここで実ブラウザ (Chromium) を起動し `src/pages/e2e-test-harness/index.astro` を開いて
 * `src/lib/pyodide-engine.ts` の計算結果を検証する。
 *
 * Pyodideの初回ロード(wasm初期化 + wheel インストール)には数秒〜十数秒かかるため、
 * デフォルトのPlaywrightタイムアウト(30秒)より長めに設定している。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:4321",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx astro preview",
    url: "http://localhost:4321/e2e-test-harness",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
