// src/lib/opponent-note-anonymize.ts のホワイトリスト方式匿名化関数の回帰テスト
// (育成データ管理計画.md §8 Phase D-4、§10リスク表の必須対応)。
//
// 「ホワイトリスト外のフィールドが出力のどこにも(トップレベルはもちろん
// attacker_build/defender_build/field の中にも)現れない」ことを、意図的に混入させた
// 禁止フィールドの値が JSON.stringify(output) に含まれないことで検証する。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { anonymizeOpponentNote } from '../src/lib/opponent-note-anonymize.ts';

describe('anonymizeOpponentNote', () => {
  it('owned_pokemon/opponent_notesの許可フィールドを正しい形にマッピングする', () => {
    const ownedPokemon = {
      species_name: 'ピカチュウ',
      nature: 'ようき',
      ability_name: 'せいでんき',
      item_name: 'いのちのたま',
      tera_type: 'でんき',
      evs: [4, 0, 0, 32, 0, 32],
      ivs: [31, 31, 31, 0, 31, 31],
      move_names: ['でんきショック', '10まんボルト'],
    };
    const opponentNote = {
      opponent_build: {
        name: 'カイリュー',
        level: 50,
        nature: 'いじっぱり',
        abilityName: 'マルチスケイル',
        itemName: 'ゴツゴツメット',
        moveNames: ['じしん'],
        teraType: 'はがね',
        evs: [252, 252, 0, 0, 4, 0],
        ivs: [31, 31, 31, 31, 31, 31],
      },
      field: { weather: 'はれ', terrain: 'エレキフィールド', defenderSideFields: ['リフレクター'], seed: 42, critical: true },
      move_name: '10まんボルト',
      client_result: { damages: [10, 20, 30] },
    };

    const result = anonymizeOpponentNote(ownedPokemon, opponentNote);

    assert.equal(result.attacker_name, 'ピカチュウ');
    assert.equal(result.defender_name, 'カイリュー');
    assert.equal(result.move_name, '10まんボルト');
    assert.deepEqual(result.attacker_build, {
      name: 'ピカチュウ',
      nature: 'ようき',
      abilityName: 'せいでんき',
      itemName: 'いのちのたま',
      teraType: 'でんき',
      evs: [4, 0, 0, 32, 0, 32],
      ivs: [31, 31, 31, 0, 31, 31],
      moveNames: ['でんきショック', '10まんボルト'],
    });
    assert.deepEqual(result.defender_build, {
      name: 'カイリュー',
      level: 50,
      nature: 'いじっぱり',
      abilityName: 'マルチスケイル',
      itemName: 'ゴツゴツメット',
      moveNames: ['じしん'],
      teraType: 'はがね',
      evs: [252, 252, 0, 0, 4, 0],
      ivs: [31, 31, 31, 31, 31, 31],
    });
    assert.deepEqual(result.field, {
      weather: 'はれ',
      terrain: 'エレキフィールド',
      defenderSideFields: ['リフレクター'],
      seed: 42,
      critical: true,
    });
    assert.deepEqual(result.client_result, { damages: [10, 20, 30] });
  });

  it('owned_pokemonのnull値のキーはattacker_buildから省略される', () => {
    const ownedPokemon = {
      species_name: 'コラッタ',
      nature: null,
      ability_name: null,
      item_name: null,
      tera_type: null,
      evs: [0, 0, 0, 0, 0, 0],
      ivs: [31, 31, 31, 31, 31, 31],
      move_names: [],
    };
    const opponentNote = {
      opponent_build: { name: 'ラッタ' },
      field: {},
      move_name: null,
      client_result: null,
    };

    const result = anonymizeOpponentNote(ownedPokemon, opponentNote);
    assert.deepEqual(result.attacker_build, {
      name: 'コラッタ',
      evs: [0, 0, 0, 0, 0, 0],
      ivs: [31, 31, 31, 31, 31, 31],
      moveNames: [],
    });
    assert.equal(result.move_name, null);
    assert.equal(result.client_result, null);
  });

  it('opponent_build.nameが無い/空文字の場合はdefender_nameが妥当なフォールバック文字列になる', () => {
    const ownedPokemon = {
      species_name: 'コラッタ',
      nature: null,
      ability_name: null,
      item_name: null,
      tera_type: null,
      evs: [0, 0, 0, 0, 0, 0],
      ivs: [31, 31, 31, 31, 31, 31],
      move_names: [],
    };

    const withoutName = anonymizeOpponentNote(ownedPokemon, {
      opponent_build: {},
      field: {},
      move_name: null,
      client_result: null,
    });
    assert.equal(typeof withoutName.defender_name, 'string');
    assert.notEqual(withoutName.defender_name, '');

    const withEmptyName = anonymizeOpponentNote(ownedPokemon, {
      opponent_build: { name: '' },
      field: {},
      move_name: null,
      client_result: null,
    });
    assert.equal(typeof withEmptyName.defender_name, 'string');
    assert.notEqual(withEmptyName.defender_name, '');
  });

  it('opponent_buildの未知キーはdefender_buildに含まれない(ホワイトリスト方式)', () => {
    const ownedPokemon = {
      species_name: 'コラッタ',
      nature: null,
      ability_name: null,
      item_name: null,
      tera_type: null,
      evs: [0, 0, 0, 0, 0, 0],
      ivs: [31, 31, 31, 31, 31, 31],
      move_names: [],
    };
    const result = anonymizeOpponentNote(ownedPokemon, {
      opponent_build: { name: 'ラッタ', unknownField: 'should-not-leak', trainerName: 'こっそり侵入' },
      field: { weather: 'あめ', unknownFieldKey: 'should-not-leak-either' },
      move_name: null,
      client_result: null,
    });
    assert.equal('unknownField' in result.defender_build, false);
    assert.equal('trainerName' in result.defender_build, false);
    assert.equal('unknownFieldKey' in result.field, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('should-not-leak'), false);
  });

  it('ホワイトリスト外フィールド(user_id/nickname/tags/is_pinned/memo等)を混入させても出力に一切現れない', () => {
    const secretUserId = '11111111-2222-3333-4444-555555555555';
    const secretOwnedPokemonId = '99999999-8888-7777-6666-555555555555';

    const ownedPokemon = {
      // 許可フィールド
      species_name: 'ピカチュウ',
      nature: 'ようき',
      ability_name: 'せいでんき',
      item_name: 'いのちのたま',
      tera_type: 'でんき',
      evs: [4, 0, 0, 32, 0, 32],
      ivs: [31, 31, 31, 0, 31, 31],
      move_names: ['10まんボルト'],
      // ホワイトリスト外フィールド(意図的に混入させる)
      id: secretOwnedPokemonId,
      user_id: secretUserId,
      nickname: '極秘ニックネーム',
      tags: ['極秘タグ'],
      is_pinned: true,
      memo: '極秘メモ:実名太郎',
      source_build_slug: '極秘スラッグ',
      created_at: '2020-01-01T00:00:00.000Z',
      updated_at: '2020-01-02T00:00:00.000Z',
      last_used_at: '2020-01-03T00:00:00.000Z',
    };

    const opponentNote = {
      // 許可フィールド
      opponent_build: { name: 'カイリュー' },
      field: { weather: 'はれ' },
      move_name: '10まんボルト',
      client_result: { damages: [1, 2, 3] },
      // ホワイトリスト外フィールド(意図的に混入させる)
      id: '00000000-1111-2222-3333-444444444444',
      owned_pokemon_id: secretOwnedPokemonId,
      user_id: secretUserId,
      memo: '対戦相手メモの極秘メモ',
      created_at: '2020-02-01T00:00:00.000Z',
      updated_at: '2020-02-02T00:00:00.000Z',
    };

    const result = anonymizeOpponentNote(ownedPokemon, opponentNote);
    const serialized = JSON.stringify(result);

    const forbiddenValues = [
      secretUserId,
      secretOwnedPokemonId,
      '極秘ニックネーム',
      '極秘タグ',
      '極秘メモ:実名太郎',
      '極秘スラッグ',
      '対戦相手メモの極秘メモ',
      '2020-01-01T00:00:00.000Z',
      '2020-02-01T00:00:00.000Z',
    ];
    for (const forbidden of forbiddenValues) {
      assert.equal(serialized.includes(forbidden), false, `禁止フィールドの値が出力に混入している: ${forbidden}`);
    }

    // トップレベルのキーそのものも確認する。
    const topLevelKeys = Object.keys(result);
    for (const forbiddenKey of ['user_id', 'nickname', 'tags', 'is_pinned', 'memo', 'owned_pokemon_id', 'id']) {
      assert.equal(topLevelKeys.includes(forbiddenKey), false);
    }

    // attacker_build/defender_build/field の中にも禁止フィールドのキーが現れないことを確認する。
    for (const forbiddenKey of ['id', 'user_id', 'nickname', 'tags', 'is_pinned', 'memo', 'owned_pokemon_id', 'created_at', 'updated_at', 'source_build_slug', 'last_used_at']) {
      assert.equal(forbiddenKey in result.attacker_build, false, `attacker_buildに禁止キーが混入: ${forbiddenKey}`);
      assert.equal(forbiddenKey in result.defender_build, false, `defender_buildに禁止キーが混入: ${forbiddenKey}`);
      assert.equal(forbiddenKey in result.field, false, `fieldに禁止キーが混入: ${forbiddenKey}`);
    }
  });
});
