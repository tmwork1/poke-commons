// src/lib/owned-pokemon.ts の userId 分離を実DBに対して検証する統合テスト
// (育成データ管理計画.md §8 Phase C、最重要要件)。
//
// owned-pokemon.ts は getSupabaseAdminClient()(service_role、RLSを常にバイパスする)経由で
// 呼び出される設計のため、tests/db/owned-pokemon-rls.test.ts が検証した RLS ポリシーは
// このアクセス経路には一切効かない。「ログイン中のユーザーが自分以外の個体へアクセスできない」
// ことを保証する唯一の砦は各関数内の `.eq('user_id', userId)` であり、それをここで直接検証する。
//
// HTTP経由のテストはローカル開発時に DEV_SESSION_USER が固定UUIDにバイパスされるため
// 2ユーザーを作り分けられない(src/lib/user-session.ts)。そのため src/lib/owned-pokemon.ts の
// 関数を直接呼び出し、2つの異なるUUID(userA・userB)で「Aが作成した個体をBのuserIdで
// 取得・更新・削除しようとすると失敗/0件になる」ことを検証する。
//
// owned-pokemon.ts は Supabase クライアントを引数で受け取る設計(cloudflare:workers に依存しない)
// のため、ここでは @supabase/supabase-js を直接使い、実際の PostgREST(service_role)経由で
// owned_pokemon テーブルへアクセスする。tests/db/owned-pokemon-rls.test.ts が生の `pg` で
// Postgres に直接繋いでRLSを検証したのに対し、本テストは「service_role で RLS が効かない
// 経路」を検証する必要があるため、あえて実際のPostgREST(ローカルSupabaseスタック)を経由する。
//
// 実行方法(ローカルSupabaseスタックが `supabase start` 済みであること):
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SECRET_KEY=<ローカルのservice_roleキー> \
//   RUN_DB_TESTS=1 node --test tests/db/owned-pokemon-lib.test.ts
// (migrations/001〜005 が適用済みのローカルSupabaseスタックに対して実行すること。
//  DATABASE_URL/RUN_DB_TESTS が未設定の場合はスキップされる。tests/db/owned-pokemon-rls.test.ts と
//  同じスキップパターンを踏襲。SUPABASE_URL/SUPABASE_SECRET_KEY が無い場合も安全側でスキップする)

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Client } from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  createOwnedPokemon,
  deleteOwnedPokemon,
  getOwnedPokemon,
  listOwnedPokemon,
  updateOwnedPokemon,
} from '../../src/lib/owned-pokemon.ts';
import type { OwnedPokemonRequestBody } from '../../src/lib/owned-pokemon-validation.ts';

const DATABASE_URL = process.env.DATABASE_URL;
const RUN_DB_TESTS = process.env.RUN_DB_TESTS === '1';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const shouldRun = RUN_DB_TESTS && !!DATABASE_URL && !!SUPABASE_URL && !!SUPABASE_SECRET_KEY;

function makeInput(overrides: Partial<OwnedPokemonRequestBody> = {}): OwnedPokemonRequestBody {
  return {
    nickname: null,
    species_name: 'ピカチュウ',
    level: 50,
    nature: null,
    ability_name: null,
    item_name: null,
    tera_type: null,
    evs: [0, 0, 0, 0, 0, 0],
    ivs: [31, 31, 31, 31, 31, 31],
    move_names: [],
    memo: null,
    tags: [],
    is_pinned: false,
    ...overrides,
  };
}

describe('src/lib/owned-pokemon.ts のuserId分離(userIdフィルタが唯一の砦であることの検証)', {
  skip: shouldRun
    ? false
    : 'DATABASE_URL/SUPABASE_URL/SUPABASE_SECRET_KEY/RUN_DB_TESTS が未設定のためスキップ(ローカルSupabaseスタックへのDB接続を伴う統合テスト)',
}, () => {
  let admin: Client;
  let supabase: SupabaseClient;
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  let ownedPokemonId: string;

  before(async () => {
    admin = new Client({ connectionString: DATABASE_URL });
    await admin.connect();
    await admin.query('INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4)', [
      userA,
      'owned-pokemon-lib-test-user-a@example.com',
      userB,
      'owned-pokemon-lib-test-user-b@example.com',
    ]);

    supabase = createClient(SUPABASE_URL as string, SUPABASE_SECRET_KEY as string, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  after(async () => {
    // owned_pokemon は ON DELETE CASCADE で auth.users の削除に追従して消える。
    await admin.query('DELETE FROM auth.users WHERE id IN ($1, $2)', [userA, userB]);
    await admin.end();
  });

  it('userAはcreateOwnedPokemon/getOwnedPokemonで自分の個体を作成・取得できる', async () => {
    const created = await createOwnedPokemon(userA, makeInput({ nickname: 'エース' }), supabase);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    ownedPokemonId = created.data.id;
    assert.equal(created.data.user_id, userA);
    assert.equal(created.data.nickname, 'エース');

    const fetched = await getOwnedPokemon(userA, ownedPokemonId, supabase);
    assert.equal(fetched.ok, true);
    if (!fetched.ok) return;
    assert.equal(fetched.data?.id, ownedPokemonId);
  });

  it('userBはuserAの個体をgetOwnedPokemonで取得できない(nullが返る)', async () => {
    const result = await getOwnedPokemon(userB, ownedPokemonId, supabase);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data, null);
  });

  it('userBはuserAの個体をlistOwnedPokemonの一覧に含められない', async () => {
    const result = await listOwnedPokemon(userB, {}, supabase);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      result.data.some((p) => p.id === ownedPokemonId),
      false,
    );
  });

  it('userAはlistOwnedPokemonの一覧に自分の個体を含められる', async () => {
    const result = await listOwnedPokemon(userA, {}, supabase);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      result.data.some((p) => p.id === ownedPokemonId),
      true,
    );
  });

  it('userBはuserAの個体をupdateOwnedPokemonで更新できない(0件更新でdata:null)', async () => {
    const result = await updateOwnedPokemon(
      userB,
      ownedPokemonId,
      makeInput({ nickname: '乗っ取り' }),
      supabase,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data, null);

    // 実際に更新されていないことをuserA視点でも確認する。
    const check = await getOwnedPokemon(userA, ownedPokemonId, supabase);
    assert.equal(check.ok, true);
    if (!check.ok) return;
    assert.equal(check.data?.nickname, 'エース');
  });

  it('userBはuserAの個体をdeleteOwnedPokemonで削除できない(false)', async () => {
    const result = await deleteOwnedPokemon(userB, ownedPokemonId, supabase);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data, false);

    // 実際に削除されていないことをuserA視点でも確認する。
    const check = await getOwnedPokemon(userA, ownedPokemonId, supabase);
    assert.equal(check.ok, true);
    if (!check.ok) return;
    assert.notEqual(check.data, null);
  });

  it('userAは自分のupdateOwnedPokemon/deleteOwnedPokemonを実行できる', async () => {
    const updated = await updateOwnedPokemon(
      userA,
      ownedPokemonId,
      makeInput({ nickname: '更新後' }),
      supabase,
    );
    assert.equal(updated.ok, true);
    if (updated.ok) assert.equal(updated.data?.nickname, '更新後');

    const deleted = await deleteOwnedPokemon(userA, ownedPokemonId, supabase);
    assert.equal(deleted.ok, true);
    if (deleted.ok) assert.equal(deleted.data, true);
  });

  it('存在しないIDに対するgetOwnedPokemon/updateOwnedPokemon/deleteOwnedPokemonは他人の所有物と同じ結果(null/false)を返す(存在漏洩防止)', async () => {
    const missingId = crypto.randomUUID();

    const fetched = await getOwnedPokemon(userA, missingId, supabase);
    assert.equal(fetched.ok, true);
    if (fetched.ok) assert.equal(fetched.data, null);

    const updated = await updateOwnedPokemon(userA, missingId, makeInput(), supabase);
    assert.equal(updated.ok, true);
    if (updated.ok) assert.equal(updated.data, null);

    const deleted = await deleteOwnedPokemon(userA, missingId, supabase);
    assert.equal(deleted.ok, true);
    if (deleted.ok) assert.equal(deleted.data, false);
  });
});
