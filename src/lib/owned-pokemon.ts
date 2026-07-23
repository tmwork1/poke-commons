// owned_pokemon への読み書きを集約する、HTTP/セッションの知識を一切持たないデータアクセス層
// (育成データ管理計画.md §8 Phase C-1)。
//
// ##### 最重要: このファイルが「他人のデータへの唯一の砦」であること #####
// poke-commons の書き込みAPIは全て getSupabaseAdminClient()(service_role、RLSを常にバイパスする)
// 経由で実行する設計(既存 builds.ts・damage-calcs.ts と同じ、計画書§2.3)。つまり owned_pokemon の
// RLSポリシー(migrations/005_owned_pokemon_rls.sql)はこの経路には一切効かない。
// 「ログイン中のユーザーが自分以外の個体を閲覧・改ざんできない」ことを保証するのは、
// この下の各関数が発行するクエリに必ず含む `.eq('user_id', userId)` のみである。
//
// そのため、この下の関数を実装・変更する際は必ず以下を守ること:
//   1. すべての公開関数は第一引数として `userId: string` を受け取る
//   2. owned_pokemon への SELECT/UPDATE/DELETE には必ず `.eq('user_id', userId)` を含める
//      (対象行の所有者チェックを兼ねる。存在しないIDと他人のIDのいずれも同じ「0件」として扱い、
//      リソースの存在自体を漏らさない)
//   3. INSERT の user_id には必ずこの引数の userId を書き込む(リクエストボディ由来の値は使わない)
//   4. Supabase クライアントは呼び出し元(APIルート等)から注入させる(このファイル自身は
//      import.meta.env や getSupabaseAdminClient() を呼ばない)。これにより
//      tests/db/owned-pokemon-lib.test.ts のような plain `node --test` からも
//      (Cloudflare Workers ランタイム専用の `cloudflare:workers` に依存せず)直接呼び出せる、
//      userId と入出力だけに依存する純粋なデータアクセス層になる
//
// テスト: tests/db/owned-pokemon-lib.test.ts で「userAが作成した個体をuserBのuserIdで
// 取得・更新・削除しようとすると失敗/0件になる」ことを実DBに対して検証している。

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OwnedPokemonRequestBody } from './owned-pokemon-validation';

export interface OwnedPokemonRecord {
  id: string;
  user_id: string;
  nickname: string | null;
  species_name: string;
  level: number | null;
  nature: string | null;
  ability_name: string | null;
  item_name: string | null;
  tera_type: string | null;
  evs: number[];
  ivs: number[];
  move_names: string[];
  memo: string | null;
  tags: string[];
  is_pinned: boolean;
  source_build_slug: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export type OwnedPokemonSort = 'updated_at' | 'last_used_at' | 'nickname';

export interface ListOwnedPokemonOptions {
  sort?: OwnedPokemonSort;
  // 指定した全タグを含む個体のみ(AND)に絞り込む(計画書§6.1)。
  tags?: string[];
  // ニックネーム/種族/特性/持ち物/テラスの部分一致(OR)によるサーバー側の簡易絞り込み。
  // 技名(move_names)の部分一致や複数語のAND検索はPostgRESTの配列演算子では表現しづらいため、
  // 一覧ページ(C-2)側は取得した全件をクライアント側で再フィルタする(計画書§6.1が明示的に許容)。
  search?: string;
}

export type OwnedPokemonResult<T> = { ok: true; data: T } | { ok: false; error: string };

const OWNED_POKEMON_COLUMNS =
  'id, user_id, nickname, species_name, level, nature, ability_name, item_name, tera_type, evs, ivs, move_names, memo, tags, is_pinned, source_build_slug, created_at, updated_at, last_used_at';

function logError(context: string, error: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[owned-pokemon] ${context}:`, error);
}

export async function listOwnedPokemon(
  userId: string,
  options: ListOwnedPokemonOptions,
  supabase: SupabaseClient,
): Promise<OwnedPokemonResult<OwnedPokemonRecord[]>> {
  let query = supabase.from('owned_pokemon').select(OWNED_POKEMON_COLUMNS).eq('user_id', userId);

  if (options.tags && options.tags.length > 0) {
    query = query.contains('tags', options.tags);
  }

  if (options.search && options.search.trim() !== '') {
    // PostgRESTの .or() はカンマ区切りの複合フィルタをそのまま1つの文字列として組み立てるため、
    // `,` `(` `)` はDSLの区切り文字として解釈されてしまう(例: ユーザー入力に "a,b)or(x" が
    // 含まれると不正なフィルタ式になり500エラーになる)。user_id の絞り込みは別のトップレベル
    // フィルタとして独立にANDされる(supabase-jsの.eq()呼び出し)ため、この文字列を壊しても
    // 他ユーザーの行が見えるようになるわけではないが、検索語に起因する500エラーを避けるため
    // DSLの区切り文字は事前に取り除く。ILIKEのワイルドカード文字(%・_)は別途エスケープする。
    const term = options.search
      .trim()
      .replace(/[,()]/g, ' ')
      .replace(/[%_]/g, (m) => `\\${m}`);
    const pattern = `%${term}%`;
    query = query.or(
      [
        `nickname.ilike.${pattern}`,
        `species_name.ilike.${pattern}`,
        `ability_name.ilike.${pattern}`,
        `item_name.ilike.${pattern}`,
        `tera_type.ilike.${pattern}`,
      ].join(','),
    );
  }

  // ピン留めは常に上部固定(計画書§6.1)。そのうえで並び替えキーを適用する。
  query = query.order('is_pinned', { ascending: false });
  switch (options.sort) {
    case 'last_used_at':
      query = query.order('last_used_at', { ascending: false, nullsFirst: false });
      break;
    case 'nickname':
      query = query.order('nickname', { ascending: true, nullsFirst: false }).order('species_name', {
        ascending: true,
      });
      break;
    case 'updated_at':
    default:
      query = query.order('updated_at', { ascending: false });
      break;
  }

  const { data, error } = await query;
  if (error) {
    logError('listOwnedPokemon failed', error);
    return { ok: false, error: 'Failed to list owned pokemon' };
  }
  return { ok: true, data: (data ?? []) as OwnedPokemonRecord[] };
}

// 見つからない場合と他人の所有物である場合を区別せず null を返す(存在漏洩防止)。
export async function getOwnedPokemon(
  userId: string,
  id: string,
  supabase: SupabaseClient,
): Promise<OwnedPokemonResult<OwnedPokemonRecord | null>> {
  const { data, error } = await supabase
    .from('owned_pokemon')
    .select(OWNED_POKEMON_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logError('getOwnedPokemon failed', error);
    return { ok: false, error: 'Failed to fetch owned pokemon' };
  }
  return { ok: true, data: (data as OwnedPokemonRecord | null) ?? null };
}

export async function createOwnedPokemon(
  userId: string,
  input: OwnedPokemonRequestBody,
  supabase: SupabaseClient,
): Promise<OwnedPokemonResult<OwnedPokemonRecord>> {
  const { data, error } = await supabase
    .from('owned_pokemon')
    .insert({
      user_id: userId, // リクエストボディ由来の値は一切使わない(なりすまし防止)
      nickname: input.nickname,
      species_name: input.species_name,
      level: input.level,
      nature: input.nature,
      ability_name: input.ability_name,
      item_name: input.item_name,
      tera_type: input.tera_type,
      evs: input.evs,
      ivs: input.ivs,
      move_names: input.move_names,
      memo: input.memo,
      tags: input.tags,
      is_pinned: input.is_pinned,
    })
    .select(OWNED_POKEMON_COLUMNS)
    .single();

  if (error || !data) {
    logError('createOwnedPokemon failed', error);
    return { ok: false, error: 'Failed to create owned pokemon' };
  }
  return { ok: true, data: data as OwnedPokemonRecord };
}

// 対象が存在しない、または他人の所有物の場合は data: null を返す(0件更新。存在漏洩防止)。
export async function updateOwnedPokemon(
  userId: string,
  id: string,
  input: OwnedPokemonRequestBody,
  supabase: SupabaseClient,
): Promise<OwnedPokemonResult<OwnedPokemonRecord | null>> {
  const { data, error } = await supabase
    .from('owned_pokemon')
    .update({
      nickname: input.nickname,
      species_name: input.species_name,
      level: input.level,
      nature: input.nature,
      ability_name: input.ability_name,
      item_name: input.item_name,
      tera_type: input.tera_type,
      evs: input.evs,
      ivs: input.ivs,
      move_names: input.move_names,
      memo: input.memo,
      tags: input.tags,
      is_pinned: input.is_pinned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId) // これが無いと他人の行を更新できてしまう(このファイルの最重要事項)
    .select(OWNED_POKEMON_COLUMNS)
    .maybeSingle();

  if (error) {
    logError('updateOwnedPokemon failed', error);
    return { ok: false, error: 'Failed to update owned pokemon' };
  }
  return { ok: true, data: (data as OwnedPokemonRecord | null) ?? null };
}

// 削除できた場合は true、対象が存在しない/他人の所有物の場合は false を返す。
export async function deleteOwnedPokemon(
  userId: string,
  id: string,
  supabase: SupabaseClient,
): Promise<OwnedPokemonResult<boolean>> {
  const { data, error } = await supabase
    .from('owned_pokemon')
    .delete()
    .eq('id', id)
    .eq('user_id', userId) // これが無いと他人の行を削除できてしまう(このファイルの最重要事項)
    .select('id');

  if (error) {
    logError('deleteOwnedPokemon failed', error);
    return { ok: false, error: 'Failed to delete owned pokemon' };
  }
  return { ok: true, data: (data ?? []).length > 0 };
}
