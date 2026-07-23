// POST /api/damage-calcs のリクエストボディ検証ロジックの回帰テスト。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateDamageCalcRequestBody } from '../src/lib/damage-calc-validation.ts';

describe('validateDamageCalcRequestBody', () => {
  it('必須項目を満たすリクエストを受け入れる', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: { evs: { atk: 32 } },
      defender_build: {},
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.attacker_name, 'ピカチュウ');
      assert.equal(result.value.defender_name, 'フシギダネ');
      assert.equal(result.value.move_name, 'でんきショック');
      assert.deepEqual(result.value.attacker_build, { evs: { atk: 32 } });
      assert.deepEqual(result.value.defender_build, {});
      assert.deepEqual(result.value.field, {});
      assert.equal(result.value.client_result, undefined);
    }
  });

  it('field省略時は空オブジェクトを補う', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: {},
      defender_build: {},
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value.field, {});
    }
  });

  it('field・client_resultを指定した場合はそのまま保持する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: {},
      defender_build: {},
      field: { weather: 'rain' },
      client_result: { damages: [10, 11, 12], lethal: [{ attackCount: 2, probability: 0.5 }] },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value.field, { weather: 'rain' });
      assert.deepEqual(result.value.client_result, {
        damages: [10, 11, 12],
        lethal: [{ attackCount: 2, probability: 0.5 }],
      });
    }
  });

  it('attacker_nameが空文字の場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: '',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: {},
      defender_build: {},
    });
    assert.equal(result.ok, false);
  });

  it('attacker_nameが空白のみの場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: '   ',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: {},
      defender_build: {},
    });
    assert.equal(result.ok, false);
  });

  it('attacker_nameが無い場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: {},
      defender_build: {},
    });
    assert.equal(result.ok, false);
  });

  it('defender_nameが文字列でない場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 123,
      move_name: 'でんきショック',
      attacker_build: {},
      defender_build: {},
    });
    assert.equal(result.ok, false);
  });

  it('move_nameが無い場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 'フシギダネ',
      attacker_build: {},
      defender_build: {},
    });
    assert.equal(result.ok, false);
  });

  it('attacker_buildがオブジェクトでない場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: 'not-an-object',
      defender_build: {},
    });
    assert.equal(result.ok, false);
  });

  it('attacker_buildが配列の場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: [1, 2, 3],
      defender_build: {},
    });
    assert.equal(result.ok, false);
  });

  it('defender_buildが無い場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: {},
    });
    assert.equal(result.ok, false);
  });

  it('fieldがオブジェクトでない場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: {},
      defender_build: {},
      field: 'sunny',
    });
    assert.equal(result.ok, false);
  });

  it('client_resultがオブジェクトでない場合は拒否する', () => {
    const result = validateDamageCalcRequestBody({
      attacker_name: 'ピカチュウ',
      defender_name: 'フシギダネ',
      move_name: 'でんきショック',
      attacker_build: {},
      defender_build: {},
      client_result: [10, 11, 12],
    });
    assert.equal(result.ok, false);
  });

  it('bodyが配列の場合は拒否する', () => {
    const result = validateDamageCalcRequestBody([1, 2, 3]);
    assert.equal(result.ok, false);
  });

  it('bodyがnullの場合は拒否する', () => {
    const result = validateDamageCalcRequestBody(null);
    assert.equal(result.ok, false);
  });
});
