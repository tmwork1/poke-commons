// POST /api/events のリクエストボディ検証ロジックの回帰テスト。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateEventRequestBody, ALLOWED_EVENT_TYPES } from '../src/lib/event-validation.ts';

describe('validateEventRequestBody', () => {
  it('許可リスト内の event_type + object payload を受け入れる', () => {
    const result = validateEventRequestBody({ event_type: 'damage_calc', payload: { attacker: 'ピカチュウ' } });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.event_type, 'damage_calc');
      assert.deepEqual(result.value.payload, { attacker: 'ピカチュウ' });
    }
  });

  it('許可リストの全event_typeを受け入れる', () => {
    for (const eventType of ALLOWED_EVENT_TYPES) {
      const result = validateEventRequestBody({ event_type: eventType, payload: {} });
      assert.equal(result.ok, true, `${eventType} should be valid`);
    }
  });

  it('payload省略時は空オブジェクトを補う', () => {
    const result = validateEventRequestBody({ event_type: 'search' });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value.payload, {});
    }
  });

  it('client_result等の未検証フィールドを含むpayloadもそのまま受け入れる (§2.6)', () => {
    const result = validateEventRequestBody({
      event_type: 'damage_calc',
      payload: { attacker: 'ピカチュウ', client_result: { damages: [10, 11, 12] } },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value.payload.client_result, { damages: [10, 11, 12] });
    }
  });

  it('許可リストに無いevent_typeは拒否する', () => {
    const result = validateEventRequestBody({ event_type: 'not_a_real_type', payload: {} });
    assert.equal(result.ok, false);
  });

  it('event_typeが無い場合は拒否する', () => {
    const result = validateEventRequestBody({ payload: {} });
    assert.equal(result.ok, false);
  });

  it('event_typeが文字列でない場合は拒否する', () => {
    const result = validateEventRequestBody({ event_type: 123, payload: {} });
    assert.equal(result.ok, false);
  });

  it('payloadが配列の場合は拒否する', () => {
    const result = validateEventRequestBody({ event_type: 'search', payload: [1, 2, 3] });
    assert.equal(result.ok, false);
  });

  it('payloadがnullの場合は拒否する', () => {
    const result = validateEventRequestBody({ event_type: 'search', payload: null });
    assert.equal(result.ok, false);
  });

  it('bodyが配列の場合は拒否する (JSON壊れ相当)', () => {
    const result = validateEventRequestBody([1, 2, 3]);
    assert.equal(result.ok, false);
  });

  it('bodyがnullの場合は拒否する', () => {
    const result = validateEventRequestBody(null);
    assert.equal(result.ok, false);
  });

  it('bodyが文字列の場合は拒否する', () => {
    const result = validateEventRequestBody('not-json-object');
    assert.equal(result.ok, false);
  });
});
