// GET /api/builds/:slug: 共有スラッグでの育成閲覧API (開発プラン §3 Phase3-1)。
// 公開閲覧のみなので service_role は使わず、RLS の builds_public_read ポリシー
// (migrations/002_enable_rls.sql, is_public = true の行のみ) を経由する anon クライアントで読む
// (suggestions.ts と同じ最小権限の方針)。非公開ビルドは自然に0件になり404を返す。
import type { APIContext } from 'astro';
import { jsonResponse, methodNotAllowed } from '../_shared';
import { getSupabasePublicClient } from '../../../lib/supabase';

export const prerender = false;

export async function GET({ params }: APIContext): Promise<Response> {
  const slug = params.slug;
  if (!slug) {
    return jsonResponse({ error: 'Build not found' }, 404);
  }

  const supabase = await getSupabasePublicClient();
  const { data, error } = await supabase
    .from('builds')
    .select('id, pokemon_name, nature, ability_name, item_name, tera_type, evs, ivs, move_names, share_slug, created_at')
    .eq('share_slug', slug)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch build:', error);
    return jsonResponse({ error: 'Failed to fetch build' }, 500);
  }

  if (!data) {
    return jsonResponse({ error: 'Build not found' }, 404);
  }

  return jsonResponse({ data }, 200);
}

export const POST = () => methodNotAllowed(['GET']);
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
