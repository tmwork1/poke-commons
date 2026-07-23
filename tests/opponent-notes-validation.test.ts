// /api/opponent-notes・/api/opponent-notes/:id のリクエストボディ検証ロジックの回帰テスト
// (owned-pokemon-validation.test.ts と同じパターン)。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateOpponentNoteRequestBody } from '../src/lib/opponent-notes-validation.ts';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

describe('validateOpponentNoteRequestBody', () => {
  it('新規作成(requireOwnedPokemonId: true)は最小限のリクエストを既定値付きで受け入れる', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー' } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.owned_pokemon_id, VALID_UUID);
      assert.deepEqual(result.value.opponent_build, { name: 'カイリュー' });
      assert.deepEqual(result.value.field, {});
      assert.equal(result.value.move_name, null);
      assert.equal(result.value.client_result, null);
      assert.equal(result.value.memo, null);
    }
  });

  it('新規作成でowned_pokemon_idが無い場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { opponent_build: { name: 'カイリュー' } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('新規作成でowned_pokemon_idがuuid形式でない場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: 'not-a-uuid', opponent_build: { name: 'カイリュー' } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('更新(requireOwnedPokemonId: false)はowned_pokemon_idが無くても受け入れ、値はnullになる', () => {
    const result = validateOpponentNoteRequestBody(
      { opponent_build: { name: 'カイリュー' } },
      { requireOwnedPokemonId: false },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.owned_pokemon_id, null);
    }
  });

  it('全項目を指定したリクエストをそのまま受け入れる', () => {
    const result = validateOpponentNoteRequestBody(
      {
        owned_pokemon_id: VALID_UUID,
        opponent_build: {
          name: 'カイリュー',
          level: 50,
          nature: 'いじっぱり',
          gender: 'male',
          abilityName: 'マルチスケイル',
          itemName: 'ゴツゴツメット',
          moveNames: ['じしん', 'げきりん'],
          teraType: 'はがね',
          evs: [32, 32, 0, 0, 4, 0],
          ivs: [31, 31, 31, 31, 31, 31],
        },
        field: { weather: 'はれ', terrain: 'エレキフィールド', defenderSideFields: ['リフレクター'], seed: 1, critical: true },
        move_name: '10まんボルト',
        client_result: { damages: [1, 2, 3] },
        memo: 'メモ',
      },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.move_name, '10まんボルト');
      assert.deepEqual(result.value.client_result, { damages: [1, 2, 3] });
      assert.equal(result.value.memo, 'メモ');
      assert.equal(result.value.opponent_build.name, 'カイリュー');
      assert.equal(result.value.opponent_build.level, 50);
      assert.equal(result.value.field.weather, 'はれ');
      assert.equal(result.value.field.seed, 1);
      assert.equal(result.value.field.critical, true);
    }
  });

  it('opponent_buildが無い場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody({ owned_pokemon_id: VALID_UUID }, { requireOwnedPokemonId: true });
    assert.equal(result.ok, false);
  });

  it('opponent_build.nameが空文字の場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: '' } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('opponent_build.nameが無い場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { level: 50 } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('opponent_buildに未知のキーが含まれる場合は拒否する(PokemonSpec型に対応する項目のみ許容)', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー', trainerName: 'こっそり' } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('opponent_build.genderが不正な値の場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー', gender: 'other' } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('opponent_build.evsが範囲(0〜32)を超える場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー', evs: [33, 0, 0, 0, 0, 0] } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('opponent_build.ivsが範囲(0〜31)を超える場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー', ivs: [32, 31, 31, 31, 31, 31] } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('opponent_build.moveNamesが5件以上の場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー', moveNames: ['a', 'b', 'c', 'd', 'e'] } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('fieldに未知のキーが含まれる場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー' }, field: { unknownKey: 'x' } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('field.criticalが真偽値でない場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー' }, field: { critical: 'yes' } },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('move_nameが文字列でない場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー' }, move_name: 123 },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('client_resultがオブジェクトでない場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー' }, client_result: 'not-an-object' },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, false);
  });

  it('空文字のmemo/move_nameはnullに正規化される(クリア操作の表現)', () => {
    const result = validateOpponentNoteRequestBody(
      { owned_pokemon_id: VALID_UUID, opponent_build: { name: 'カイリュー' }, memo: '', move_name: '' },
      { requireOwnedPokemonId: true },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.memo, null);
      assert.equal(result.value.move_name, null);
    }
  });

  it('bodyが配列の場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody([1, 2, 3], { requireOwnedPokemonId: true });
    assert.equal(result.ok, false);
  });

  it('bodyがnullの場合は拒否する', () => {
    const result = validateOpponentNoteRequestBody(null, { requireOwnedPokemonId: true });
    assert.equal(result.ok, false);
  });
});
