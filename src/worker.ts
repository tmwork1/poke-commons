// Astro の fetch ハンドラを合成する Worker エントリ。wrangler.jsonc の "main" をこのファイルに向けている。
// Phase 5 で集計 cron ジョブを追加する際、ここに scheduled ハンドラを足す(開発プラン §2.5, §3 Phase5-1)。
import { handle } from '@astrojs/cloudflare/handler';

export default {
	async fetch(request, env, ctx) {
		return handle(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
