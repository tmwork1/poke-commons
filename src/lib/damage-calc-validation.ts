// POST /api/damage-calcs のリクエストボディ検証ロジック。
// Astro/Cloudflare ランタイムに依存しない純粋な関数として切り出し、node --test で
// ユニットテストできるようにする（src/lib/event-validation.ts と同じ方針）。

export interface DamageCalcRequestBody {
  attacker_name: string;
  defender_name: string;
  move_name: string;
  // 努力値・性格・特性・持ち物・テラスタイプなど自由形式 (jsonb にそのまま保存する)
  attacker_build: Record<string, unknown>;
  defender_build: Record<string, unknown>;
  // 天候・地形・壁など自由形式。省略時は空オブジェクトを補う
  field: Record<string, unknown>;
  // UI表示用の未検証計算結果。集計には使わない (開発プラン §2.6)
  client_result?: Record<string, unknown>;
}

export type DamageCalcValidationResult =
  | { ok: true; value: DamageCalcRequestBody }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateDamageCalcRequestBody(body: unknown): DamageCalcValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const { attacker_name, defender_name, move_name, attacker_build, defender_build, field, client_result } = body;

  if (!isNonEmptyString(attacker_name)) {
    return { ok: false, error: 'attacker_name must be a non-empty string' };
  }
  if (!isNonEmptyString(defender_name)) {
    return { ok: false, error: 'defender_name must be a non-empty string' };
  }
  if (!isNonEmptyString(move_name)) {
    return { ok: false, error: 'move_name must be a non-empty string' };
  }
  if (!isPlainObject(attacker_build)) {
    return { ok: false, error: 'attacker_build must be a JSON object' };
  }
  if (!isPlainObject(defender_build)) {
    return { ok: false, error: 'defender_build must be a JSON object' };
  }
  if (field !== undefined && !isPlainObject(field)) {
    return { ok: false, error: 'field must be a JSON object' };
  }
  if (client_result !== undefined && !isPlainObject(client_result)) {
    return { ok: false, error: 'client_result must be a JSON object' };
  }

  return {
    ok: true,
    value: {
      attacker_name,
      defender_name,
      move_name,
      attacker_build,
      defender_build,
      field: (field as Record<string, unknown> | undefined) ?? {},
      client_result: client_result as Record<string, unknown> | undefined,
    },
  };
}
