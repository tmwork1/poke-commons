// POST /api/search のリクエストボディ検証ロジック。
// Astro/Cloudflare ランタイムに依存しない純粋な関数として切り出し、node --test で
// ユニットテストできるようにする（src/lib/damage-calc-validation.ts と同じ方針）。

export const SEARCH_CATEGORIES = ['pokemon', 'move', 'ability', 'item'] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export interface SearchRequestBody {
  // 前後空白はトリム済み。
  query: string;
  // 省略時は4カテゴリ全てを検索対象にする。
  category?: SearchCategory;
}

export type SearchValidationResult = { ok: true; value: SearchRequestBody } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSearchCategory(value: unknown): value is SearchCategory {
  return typeof value === 'string' && (SEARCH_CATEGORIES as readonly string[]).includes(value);
}

export function validateSearchRequestBody(body: unknown): SearchValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const { query, category } = body;

  if (typeof query !== 'string') {
    return { ok: false, error: 'query must be a string' };
  }
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return { ok: false, error: 'query must not be empty' };
  }
  if (category !== undefined && !isSearchCategory(category)) {
    return { ok: false, error: `category must be one of: ${SEARCH_CATEGORIES.join(', ')}` };
  }

  return {
    ok: true,
    value: {
      query: trimmedQuery,
      category: category as SearchCategory | undefined,
    },
  };
}
