#!/usr/bin/env node
/**
 * jpoke (vendor/jpoke) を単一の情報源として、以下2種類の静的アセットを
 * public/master-data/ 配下に生成するビルドスクリプト。
 *
 *   1. オートコンプリート用軽量 JSON: public/master-data/autocomplete/*.json
 *   2. Pyodide 実行用 wheel:          public/master-data/pyodide/wheels/*.whl
 *
 * 実行: npm run build:master-data
 *
 * jpoke はこのリポジトリ内に `vendor/jpoke` としてバージョン固定で同梱(vendoring)している
 * (開発プラン §4リスク表: 「jpoke をバージョン固定で vendoring し、更新は回帰テスト付きで
 * 取り込む」)。CI・Cloudflareのビルド環境には存在しない兄弟ディレクトリ `../jpoke` には
 * 依存しない。更新手順は vendor/jpoke/VENDORING.md を参照。
 *
 * 環境変数:
 *   JPOKE_DIR    jpoke リポジトリのパス(既定: このリポジトリ内の vendor/jpoke。
 *                ローカルで手元の最新 jpoke を試したい場合などに上書き可能)
 *   JPOKE_PYTHON jpoke 用 Python 実行ファイルのパス(既定: システムの `python`/`python3`。
 *                jpoke 専用の venv がある場合はそのパスを指定してもよい)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const jpokeDir = path.resolve(process.env.JPOKE_DIR ?? path.join(repoRoot, 'vendor', 'jpoke'));
const jpokeSrcDir = path.join(jpokeDir, 'src');

// vendor/jpoke は venv を持たない(ソースのみを同梱)ため、既定では jpokeDir/.venv があれば
// それを優先しつつ(ローカルで JPOKE_DIR を手元の jpoke に向けた場合の後方互換)、無ければ
// システムの python(3) にフォールバックする。CI では setup-python + `pip install build` で
// システム Python 側に必要なものが揃う想定。
const venvPython = process.platform === 'win32'
  ? path.join(jpokeDir, '.venv', 'Scripts', 'python.exe')
  : path.join(jpokeDir, '.venv', 'bin', 'python');
const systemPython = process.platform === 'win32' ? 'python' : 'python3';
const jpokePython = process.env.JPOKE_PYTHON ?? (existsSync(venvPython) ? venvPython : systemPython);

const autocompleteOutDir = path.join(repoRoot, 'public', 'master-data', 'autocomplete');
const wheelOutDir = path.join(repoRoot, 'public', 'master-data', 'pyodide', 'wheels');

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`コマンドが失敗しました (exit ${result.status}): ${command} ${args.join(' ')}`);
  }
}

function assertExists(targetPath, hint) {
  if (!existsSync(targetPath)) {
    throw new Error(`見つかりません: ${targetPath}\n${hint}`);
  }
}

// jpokePython がシステム PATH 上のコマンド名(python/python3)の場合は existsSync では検証できない
// (絶対パスではないため)。venv やユーザー指定の絶対パスの場合のみ事前チェックし、それ以外は
// spawnSync 実行時のエラーに委ねる。
function assertPythonUsable() {
  if (path.isAbsolute(jpokePython)) {
    assertExists(jpokePython, 'jpoke 用の Python 実行ファイルが見つかりません。JPOKE_PYTHON 環境変数で Python 実行ファイルを指定してください。');
  }
}

function buildAutocomplete() {
  console.log('\n=== 1. オートコンプリート用軽量 JSON を生成 ===');
  assertExists(jpokeDir, 'JPOKE_DIR 環境変数で jpoke リポジトリの場所を指定してください。');
  assertPythonUsable();

  mkdirSync(autocompleteOutDir, { recursive: true });

  const extractScript = path.join(__dirname, 'extract_autocomplete.py');
  run(jpokePython, [extractScript, jpokeSrcDir, autocompleteOutDir]);
}

function buildPyodideWheel() {
  console.log('\n=== 2. Pyodide 実行用 wheel をビルド ===');
  assertExists(jpokeDir, 'JPOKE_DIR 環境変数で jpoke リポジトリの場所を指定してください。');
  assertPythonUsable();

  mkdirSync(wheelOutDir, { recursive: true });

  // 既存の wheel をクリアしてから再ビルド(バージョン変更時に古い wheel が残らないようにする)。
  for (const entry of readdirSync(wheelOutDir)) {
    if (entry.endsWith('.whl')) {
      rmSync(path.join(wheelOutDir, entry));
    }
  }

  const tmpOutDir = mkdtempSync(path.join(tmpdir(), 'jpoke-wheel-'));
  try {
    run(jpokePython, ['-m', 'build', '--wheel', '--outdir', tmpOutDir], { cwd: jpokeDir });

    const wheels = readdirSync(tmpOutDir).filter((f) => f.endsWith('.whl'));
    if (wheels.length === 0) {
      throw new Error('wheel のビルドに成功しましたが .whl ファイルが見つかりませんでした。');
    }
    for (const wheel of wheels) {
      copyFileSync(path.join(tmpOutDir, wheel), path.join(wheelOutDir, wheel));
      console.log(`wrote ${path.join(wheelOutDir, wheel)}`);
    }
  } finally {
    rmSync(tmpOutDir, { recursive: true, force: true });
  }
}

function main() {
  console.log(`jpoke ディレクトリ: ${jpokeDir}`);
  console.log(`jpoke python: ${jpokePython}`);

  buildAutocomplete();
  buildPyodideWheel();

  console.log('\n完了: public/master-data/ 配下にマスタデータを生成しました。');
}

main();
