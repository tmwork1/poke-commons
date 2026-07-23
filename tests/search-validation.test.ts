// POST /api/search のリクエストボディ検証ロジックの回帰テスト。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateSearchRequestBody } from '../src/lib/search-validation.ts';

describe('validateSearchRequestBody', () => {
  it('queryのみのリクエストを受け入れる（categoryは未指定のまま）', () => {
    const result = validateSearchRequestBody({ query: 'ピカ' });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.query, 'ピカ');
      assert.equal(result.value.category, undefined);
    }
  });

  it('前後の空白をトリムする', () => {
    const result = validateSearchRequestBody({ query: '  ピカチュウ  ' });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.query, 'ピカチュウ');
    }
  });

  it('categoryを指定したリクエストをそのまま受け入れる', () => {
    for (const category of ['pokemon', 'move', 'ability', 'item'] as const) {
      const result = validateSearchRequestBody({ query: 'テスト', category });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.value.category, category);
      }
    }
  });

  it('queryが空文字の場合は拒否する', () => {
    const result = validateSearchRequestBody({ query: '' });
    assert.equal(result.ok, false);
  });

  it('queryが空白のみの場合は拒否する', () => {
    const result = validateSearchRequestBody({ query: '   ' });
    assert.equal(result.ok, false);
  });

  it('queryが無い場合は拒否する', () => {
    const result = validateSearchRequestBody({});
    assert.equal(result.ok, false);
  });

  it('queryが文字列でない場合は拒否する', () => {
    const result = validateSearchRequestBody({ query: 123 });
    assert.equal(result.ok, false);
  });

  it('categoryが許可された4値以外の場合は拒否する', () => {
    const result = validateSearchRequestBody({ query: 'ピカ', category: 'trainer' });
    assert.equal(result.ok, false);
  });

  it('categoryが文字列でない場合は拒否する', () => {
    const result = validateSearchRequestBody({ query: 'ピカ', category: 123 });
    assert.equal(result.ok, false);
  });

  it('bodyが配列の場合は拒否する', () => {
    const result = validateSearchRequestBody([1, 2, 3]);
    assert.equal(result.ok, false);
  });

  it('bodyがnullの場合は拒否する', () => {
    const result = validateSearchRequestBody(null);
    assert.equal(result.ok, false);
  });
});
