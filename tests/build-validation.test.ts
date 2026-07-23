// POST /api/builds のリクエストボディ検証ロジックの回帰テスト。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateBuildRequestBody } from '../src/lib/build-validation.ts';

describe('validateBuildRequestBody', () => {
  it('pokemon_nameのみのリクエストを既定値付きで受け入れる', () => {
    const result = validateBuildRequestBody({ pokemon_name: 'ピカチュウ' });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.pokemon_name, 'ピカチュウ');
      assert.equal(result.value.nature, undefined);
      assert.deepEqual(result.value.evs, [0, 0, 0, 0, 0, 0]);
      assert.deepEqual(result.value.ivs, [31, 31, 31, 31, 31, 31]);
      assert.deepEqual(result.value.move_names, []);
      assert.equal(result.value.is_public, true);
    }
  });

  it('全項目を指定したリクエストをそのまま受け入れる', () => {
    const result = validateBuildRequestBody({
      pokemon_name: 'ピカチュウ',
      nature: 'ようき',
      ability_name: 'せいでんき',
      item_name: 'いのちのたま',
      tera_type: 'でんき',
      evs: [4, 0, 0, 32, 0, 32],
      ivs: [31, 31, 31, 0, 31, 31],
      move_names: ['でんきショック', '10まんボルト'],
      is_public: false,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.nature, 'ようき');
      assert.equal(result.value.ability_name, 'せいでんき');
      assert.equal(result.value.item_name, 'いのちのたま');
      assert.equal(result.value.tera_type, 'でんき');
      assert.deepEqual(result.value.evs, [4, 0, 0, 32, 0, 32]);
      assert.deepEqual(result.value.ivs, [31, 31, 31, 0, 31, 31]);
      assert.deepEqual(result.value.move_names, ['でんきショック', '10まんボルト']);
      assert.equal(result.value.is_public, false);
    }
  });

  it('pokemon_nameが空文字の場合は拒否する', () => {
    const result = validateBuildRequestBody({ pokemon_name: '' });
    assert.equal(result.ok, false);
  });

  it('pokemon_nameが空白のみの場合は拒否する', () => {
    const result = validateBuildRequestBody({ pokemon_name: '   ' });
    assert.equal(result.ok, false);
  });

  it('pokemon_nameが無い場合は拒否する', () => {
    const result = validateBuildRequestBody({});
    assert.equal(result.ok, false);
  });

  it('evsの長さが6でない場合は拒否する', () => {
    const result = validateBuildRequestBody({ pokemon_name: 'ピカチュウ', evs: [0, 0, 0] });
    assert.equal(result.ok, false);
  });

  it('evsが範囲(0〜32)を超える場合は拒否する', () => {
    const result = validateBuildRequestBody({
      pokemon_name: 'ピカチュウ',
      evs: [33, 0, 0, 0, 0, 0],
    });
    assert.equal(result.ok, false);
  });

  it('evsが負数を含む場合は拒否する', () => {
    const result = validateBuildRequestBody({
      pokemon_name: 'ピカチュウ',
      evs: [-1, 0, 0, 0, 0, 0],
    });
    assert.equal(result.ok, false);
  });

  it('evsが整数でない場合は拒否する', () => {
    const result = validateBuildRequestBody({
      pokemon_name: 'ピカチュウ',
      evs: [0.5, 0, 0, 0, 0, 0],
    });
    assert.equal(result.ok, false);
  });

  it('ivsが範囲(0〜31)を超える場合は拒否する', () => {
    const result = validateBuildRequestBody({
      pokemon_name: 'ピカチュウ',
      ivs: [32, 31, 31, 31, 31, 31],
    });
    assert.equal(result.ok, false);
  });

  it('move_namesが5件以上の場合は拒否する', () => {
    const result = validateBuildRequestBody({
      pokemon_name: 'ピカチュウ',
      move_names: ['a', 'b', 'c', 'd', 'e'],
    });
    assert.equal(result.ok, false);
  });

  it('move_namesが文字列でない要素を含む場合は拒否する', () => {
    const result = validateBuildRequestBody({
      pokemon_name: 'ピカチュウ',
      move_names: ['a', 1],
    });
    assert.equal(result.ok, false);
  });

  it('is_publicが真偽値でない場合は拒否する', () => {
    const result = validateBuildRequestBody({ pokemon_name: 'ピカチュウ', is_public: 'true' });
    assert.equal(result.ok, false);
  });

  it('natureが文字列でない場合は拒否する', () => {
    const result = validateBuildRequestBody({ pokemon_name: 'ピカチュウ', nature: 123 });
    assert.equal(result.ok, false);
  });

  it('bodyが配列の場合は拒否する', () => {
    const result = validateBuildRequestBody([1, 2, 3]);
    assert.equal(result.ok, false);
  });

  it('bodyがnullの場合は拒否する', () => {
    const result = validateBuildRequestBody(null);
    assert.equal(result.ok, false);
  });
});
