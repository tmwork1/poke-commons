// POST /api/builds: 育成(ビルド)の保存 + 共有スラッグ発行 (開発プラン §2.4, §3 Phase3-1, Phase3-4)。
// builds へ保存内容を保存すると同時に、events へ event_type='build_save' で計算条件相当の
// 保存内容のみを正データとして二重記録する (damage-calcs.ts と同じ流儀)。
import type { APIContext } from 'astro';
import { badRequest, jsonResponse, methodNotAllowed, readJsonBody } from './_shared';
import { validateBuildRequestBody } from '../../lib/build-validation';
import {
  computeSessionHash,
  generateSessionId,
  getUtcDateString,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from '../../lib/session-hash';
import { eventsRateLimiter } from '../../lib/rate-limit';
import { getSupabaseAdminClient } from '../../lib/supabase';
import { readEnv } from '../../config/env';

export const prerender = false;

// share_slug 用の英数字ランダム文字列。crypto.randomUUID() のハイフンを除去して先頭Nを使う
// (シンプルさ優先、過剰な汎化はしない)。
const SHARE_SLUG_LENGTH = 10;
const MAX_SLUG_RETRIES = 2;
// PostgreSQL の unique_violation エラーコード。
const UNIQUE_VIOLATION_CODE = '23505';

function generateShareSlug(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, SHARE_SLUG_LENGTH);
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  const body = await readJsonBody<unknown>(request);
  if (body.response) return body.response;

  const validation = validateBuildRequestBody(body.data ?? {});
  if (!validation.ok) return badRequest(validation.error);

  // セッションCookie (pc_sid): 非個人情報のランダムID。無ければここで発行する (damage-calcs.ts と同じ)。
  let sessionId = cookies.get(SESSION_COOKIE_NAME)?.value;
  const isNewSession = !sessionId;
  if (!sessionId) {
    sessionId = generateSessionId();
  }

  // レートリミットは events.ts / damage-calcs.ts と同じ書き込みAPI向け設定を流用する。
  const rateLimitKey = request.headers.get('cf-connecting-ip') ?? sessionId;
  const rateLimit = eventsRateLimiter.check(rateLimitKey);
  if (!rateLimit.allowed) {
    return jsonResponse({ error: 'Too many requests' }, 429);
  }

  if (isNewSession) {
    cookies.set(SESSION_COOKIE_NAME, sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // astro dev (http://localhost) では secure Cookie がセットされないため開発時のみ無効化する。
      secure: !import.meta.env.DEV,
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
  }

  const secret = readEnv('SESSION_HASH_SECRET');
  const sessionHash = await computeSessionHash(sessionId, secret, getUtcDateString());

  const { pokemon_name, nature, ability_name, item_name, tera_type, evs, ivs, move_names, is_public } =
    validation.value;

  const supabase = await getSupabaseAdminClient();

  // share_slug の衝突(DBのunique制約違反, 23505)を検出したら数回だけ再生成してリトライする。
  let data: { id: string; share_slug: string } | null = null;
  let insertError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt += 1) {
    const shareSlug = generateShareSlug();
    const { data: inserted, error } = await supabase
      .from('builds')
      .insert({
        pokemon_name,
        nature: nature ?? null,
        ability_name: ability_name ?? null,
        item_name: item_name ?? null,
        tera_type: tera_type ?? null,
        evs,
        ivs,
        move_names,
        share_slug: shareSlug,
        is_public,
        session_hash: sessionHash,
      })
      .select('id, share_slug')
      .single();

    if (!error) {
      data = inserted;
      insertError = null;
      break;
    }

    insertError = error;
    if (error.code !== UNIQUE_VIOLATION_CODE) {
      break;
    }
    // unique_violation の場合のみループを継続してslugを振り直す。
  }

  if (!data || insertError) {
    // eslint-disable-next-line no-console
    console.error('Failed to insert builds:', insertError);
    return jsonResponse({ error: 'Failed to save build' }, 500);
  }

  // events への二重記録: 保存内容(計算条件相当の入力)のみを正データとして記録する (§2.6と同じ方針)。
  const { error: eventError } = await supabase.from('events').insert({
    event_type: 'build_save',
    payload: { pokemon_name, nature, ability_name, item_name, tera_type, evs, ivs, move_names },
    session_hash: sessionHash,
  });

  if (eventError) {
    // builds への書き込みは既に成功しているため取り消さない (damage-calcs.ts と同じ、素朴な2回INSERT)。
    // eslint-disable-next-line no-console
    console.error('Failed to insert events (build_save):', eventError);
    return jsonResponse({ error: 'Failed to save build' }, 500);
  }

  return jsonResponse({ data: { id: data.id, share_slug: data.share_slug } }, 201);
}

export const GET = () => methodNotAllowed(['POST']);
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
