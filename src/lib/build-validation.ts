// POST /api/builds のリクエストボディ検証ロジック。
// Astro/Cloudflare ランタイムに依存しない純粋な関数として切り出し、node --test で
// ユニットテストできるようにする（src/lib/damage-calc-validation.ts と同じ方針）。

export interface BuildRequestBody {
  pokemon_name: string;
  nature?: string;
  ability_name?: string;
  item_name?: string;
  tera_type?: string;
  // Champions形式 [HP, 攻撃, 防御, 特攻, 特防, 素早さ]、各0〜32。省略時は全0。
  evs: number[];
  // 同順、各0〜31。省略時は全31。
  ivs: number[];
  // 最大4件。省略時は空配列。
  move_names: string[];
  // 省略時は true (共有をデフォルトにする方針。開発プラン §3 Phase3-1参照)。
  is_public: boolean;
}

export type BuildValidationResult = { ok: true; value: BuildRequestBody } | { ok: false; error: string };

const STAT_COUNT = 6;
const DEFAULT_EVS = [0, 0, 0, 0, 0, 0];
const DEFAULT_IVS = [31, 31, 31, 31, 31, 31];
const MAX_MOVE_COUNT = 4;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// evs/ivs 用: 長さ6の数値配列で、各要素が [0, max] の整数であることを検証する。
function isStatArray(value: unknown, max: number): value is number[] {
  if (!Array.isArray(value) || value.length !== STAT_COUNT) return false;
  return value.every(
    (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max,
  );
}

function isMoveNamesArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_MOVE_COUNT) return false;
  return value.every((v) => typeof v === 'string');
}

export function validateBuildRequestBody(body: unknown): BuildValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const { pokemon_name, nature, ability_name, item_name, tera_type, evs, ivs, move_names, is_public } = body;

  if (!isNonEmptyString(pokemon_name)) {
    return { ok: false, error: 'pokemon_name must be a non-empty string' };
  }
  if (nature !== undefined && typeof nature !== 'string') {
    return { ok: false, error: 'nature must be a string' };
  }
  if (ability_name !== undefined && typeof ability_name !== 'string') {
    return { ok: false, error: 'ability_name must be a string' };
  }
  if (item_name !== undefined && typeof item_name !== 'string') {
    return { ok: false, error: 'item_name must be a string' };
  }
  if (tera_type !== undefined && typeof tera_type !== 'string') {
    return { ok: false, error: 'tera_type must be a string' };
  }
  if (evs !== undefined && !isStatArray(evs, 32)) {
    return { ok: false, error: 'evs must be an array of 6 integers between 0 and 32' };
  }
  if (ivs !== undefined && !isStatArray(ivs, 31)) {
    return { ok: false, error: 'ivs must be an array of 6 integers between 0 and 31' };
  }
  if (move_names !== undefined && !isMoveNamesArray(move_names)) {
    return { ok: false, error: 'move_names must be an array of at most 4 strings' };
  }
  if (is_public !== undefined && typeof is_public !== 'boolean') {
    return { ok: false, error: 'is_public must be a boolean' };
  }

  return {
    ok: true,
    value: {
      pokemon_name,
      nature: nature as string | undefined,
      ability_name: ability_name as string | undefined,
      item_name: item_name as string | undefined,
      tera_type: tera_type as string | undefined,
      evs: (evs as number[] | undefined) ?? DEFAULT_EVS,
      ivs: (ivs as number[] | undefined) ?? DEFAULT_IVS,
      move_names: (move_names as string[] | undefined) ?? [],
      is_public: (is_public as boolean | undefined) ?? true,
    },
  };
}
