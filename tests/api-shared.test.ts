// src/pages/api/_shared.ts の共通ヘルパーの回帰テスト。
// 特に「JSONが壊れている場合は400を返す」ことを検証する
// (開発プラン §3 Phase1-4: POST /api/events のリクエストバリデーション要件)。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { badRequest, jsonResponse, methodNotAllowed, readJsonBody } from '../src/pages/api/_shared.ts';

describe('readJsonBody', () => {
  it('正しいJSONはパースされたデータを返す', async () => {
    const request = new Request('http://localhost/api/events', {
      method: 'POST',
      body: JSON.stringify({ event_type: 'search', payload: {} }),
    });
    const result = await readJsonBody<{ event_type: string }>(request);
    assert.deepEqual(result.data, { event_type: 'search', payload: {} });
    assert.equal(result.response, undefined);
  });

  it('壊れたJSONは400のレスポンスを返す', async () => {
    const request = new Request('http://localhost/api/events', {
      method: 'POST',
      body: '{not valid json',
    });
    const result = await readJsonBody(request);
    assert.equal(result.data, null);
    assert.ok(result.response);
    assert.equal(result.response?.status, 400);
    const body = await result.response!.json();
    assert.equal(body.error, 'Invalid JSON payload');
  });

  it('空ボディはエラーにせずnullを返す', async () => {
    const request = new Request('http://localhost/api/events', { method: 'POST', body: '' });
    const result = await readJsonBody(request);
    assert.equal(result.data, null);
    assert.equal(result.response, undefined);
  });
});

describe('badRequest / jsonResponse / methodNotAllowed', () => {
  it('badRequestは400とエラーメッセージを返す', async () => {
    const response = badRequest('invalid');
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid' });
  });

  it('jsonResponseはContent-Typeヘッダーを付与する', () => {
    const response = jsonResponse({ ok: true });
    assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
    assert.equal(response.status, 200);
  });

  it('methodNotAllowedは405と許可メソッド一覧を返す', async () => {
    const response = methodNotAllowed(['POST']);
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { error: 'Method not allowed', allowed: ['POST'] });
  });
});
