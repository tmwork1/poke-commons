// Cloudflare Workers の env バインディングと process.env（ローカル開発・wrangler dev）の
// 両方から環境変数を読む共通ヘルパー。lib/supabase.ts・pages/api/events.ts など複数箇所で
// 同じ読み込み処理が必要になるため集約する（poke-research の src/config/env.ts と同じ方針）。
import { env } from 'cloudflare:workers';

type EnvRecord = Record<string, string | undefined>;

const runtimeEnv = (globalThis as typeof globalThis & { process?: { env: EnvRecord } }).process?.env ?? {};
const cloudflareEnv = env as unknown as EnvRecord;

export function readEnv(key: string): string {
	return cloudflareEnv[key]?.trim() || runtimeEnv[key]?.trim() || '';
}
