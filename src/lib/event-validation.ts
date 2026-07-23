// POST /api/events のリクエストボディ検証ロジック。
// Astro/Cloudflare ランタイムに依存しない純粋な関数として切り出し、node --test で
// ユニットテストできるようにする（src/lib/rate-limit.ts と同じ方針）。
//
// event_type は将来の拡張を阻害しないよう Phase 1 時点では固定の許可リストで軽くバリデーションする
// のみに留める（開発プラン §3 Phase1-4）。

export const ALLOWED_EVENT_TYPES = ['damage_calc', 'build_save', 'search', 'compare'] as const;
export type EventType = (typeof ALLOWED_EVENT_TYPES)[number];

export interface EventRequestBody {
  event_type: EventType;
  // イベント固有データ (計算条件、検索語 など)。client_result 等の未検証値を含めることも許容する
  // (開発プラン §2.6)。events.payload は jsonb で何でも入るため、ここでは特別な分岐は設けない。
  payload: Record<string, unknown>;
}

export type EventValidationResult =
  | { ok: true; value: EventRequestBody }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateEventRequestBody(body: unknown): EventValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const { event_type, payload } = body;

  if (typeof event_type !== 'string' || !(ALLOWED_EVENT_TYPES as readonly string[]).includes(event_type)) {
    return { ok: false, error: `event_type must be one of: ${ALLOWED_EVENT_TYPES.join(', ')}` };
  }

  if (payload !== undefined && !isPlainObject(payload)) {
    return { ok: false, error: 'payload must be a JSON object' };
  }

  return {
    ok: true,
    value: {
      event_type: event_type as EventType,
      payload: (payload as Record<string, unknown> | undefined) ?? {},
    },
  };
}
