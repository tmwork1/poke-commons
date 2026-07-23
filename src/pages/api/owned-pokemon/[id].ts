// GET/PUT/DELETE /api/owned-pokemon/:id (育成データ管理計画.md §8 Phase C-1)。
//
// 認証必須(401)。実際のクエリは全て src/lib/owned-pokemon.ts へ委譲し、このファイル自身は
// 生の Supabase クエリを書かない(userIdフィルタ漏れによる他人データ露出を防ぐための設計、
// 詳細は src/lib/owned-pokemon.ts 冒頭のコメント参照)。
// 対象が存在しない場合と他人の所有物である場合はいずれも同じ404を返し、存在の有無を漏らさない。
import type { APIContext } from 'astro';
import { badRequest, isSameOrigin, jsonResponse, methodNotAllowed, readJsonBody } from '../_shared';
import { getSessionUser } from '../../../lib/user-session';
import { getSupabaseAdminClient } from '../../../lib/supabase';
import { validateOwnedPokemonRequestBody } from '../../../lib/owned-pokemon-validation';
import { deleteOwnedPokemon, getOwnedPokemon, updateOwnedPokemon } from '../../../lib/owned-pokemon';

export const prerender = false;

// owned_pokemon.id は uuid 列のため、明らかに不正な形式のパスパラメータは早期に404として扱う
// (DBへ投げて Postgrest の invalid input syntax エラーを露出させないため)。
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): Response {
  return jsonResponse({ error: 'Owned pokemon not found' }, 404);
}

export async function GET({ request, cookies, params }: APIContext): Promise<Response> {
  const user = await getSessionUser(request, cookies);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const id = params.id;
  if (!id || !UUID_PATTERN.test(id)) return notFound();

  const supabase = await getSupabaseAdminClient();
  const result = await getOwnedPokemon(user.id, id, supabase);
  if (!result.ok) return jsonResponse({ error: result.error }, 500);
  if (!result.data) return notFound();

  return jsonResponse({ data: result.data }, 200);
}

export async function PUT({ request, cookies, params }: APIContext): Promise<Response> {
  const user = await getSessionUser(request, cookies);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (!isSameOrigin(request)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const id = params.id;
  if (!id || !UUID_PATTERN.test(id)) return notFound();

  const body = await readJsonBody<unknown>(request);
  if (body.response) return body.response;

  const validation = validateOwnedPokemonRequestBody(body.data ?? {});
  if (!validation.ok) return badRequest(validation.error);

  const supabase = await getSupabaseAdminClient();
  const result = await updateOwnedPokemon(user.id, id, validation.value, supabase);
  if (!result.ok) return jsonResponse({ error: result.error }, 500);
  if (!result.data) return notFound();

  return jsonResponse({ data: result.data }, 200);
}

export async function DELETE({ request, cookies, params }: APIContext): Promise<Response> {
  const user = await getSessionUser(request, cookies);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (!isSameOrigin(request)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const id = params.id;
  if (!id || !UUID_PATTERN.test(id)) return notFound();

  const supabase = await getSupabaseAdminClient();
  const result = await deleteOwnedPokemon(user.id, id, supabase);
  if (!result.ok) return jsonResponse({ error: result.error }, 500);
  if (!result.data) return notFound();

  return jsonResponse({ data: { id } }, 200);
}

export const POST = () => methodNotAllowed(['GET', 'PUT', 'DELETE']);
export const PATCH = POST;
