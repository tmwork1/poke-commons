// /api/opponent-notes・/api/opponent-notes/:id のリクエストボディ検証ロジック。
// Astro/Cloudflare ランタイムに依存しない純粋な関数として切り出し、node --test で
// ユニットテストできるようにする(src/lib/owned-pokemon-validation.ts と同じ方針)。
//
// opponent_build/field は src/lib/pyodide-engine.ts の PokemonSpec/FieldSpec 形状に対応する
// キーのみを許容する(育成データ管理計画.md §8 Phase D-1)。ここでの検証はあくまで型・形式の
// チェックであり、「他人のデータへ書き込ませない」ホワイトリスト方式の匿名化そのものは
// src/lib/opponent-note-anonymize.ts が別途、独立して保証する(このファイルの検証を素通りしても
// 匿名化側は自前で許可フィールドのみコピーする)。

export interface OpponentBuildInput {
  name: string;
  level?: number;
  nature?: string;
  gender?: '' | 'male' | 'female';
  abilityName?: string;
  itemName?: string;
  moveNames?: string[];
  teraType?: string | null;
  evs?: number[];
  ivs?: number[];
}

export interface OpponentFieldInput {
  weather?: string;
  terrain?: string;
  defenderSideFields?: string[];
  // damage_calcs.field 相当のFieldSpecキーに加えて、Pyodideエンジンの計算オプション
  // (calcDamages() の seed/critical)も対戦相手メモの入力としてはここに含めて保存する
  // (計画書の指示: 「field(オブジェクト、FieldSpec相当のキー+任意でseed・critical)」)。
  seed?: number;
  critical?: boolean;
}

export interface OpponentNoteRequestBody {
  // 作成時は必須(呼び出し元が requireOwnedPokemonId: true で検証を要求する)。
  // 更新時は指定不要(紐づく個体の付け替えは許可しない)。
  owned_pokemon_id: string | null;
  opponent_build: OpponentBuildInput;
  field: OpponentFieldInput;
  move_name: string | null;
  client_result: Record<string, unknown> | null;
  memo: string | null;
}

export interface ValidateOpponentNoteOptions {
  // POST(新規作成)では true にして owned_pokemon_id を必須にする。
  // PUT(更新)では false にして owned_pokemon_id を受け付けない(未指定として無視する)。
  requireOwnedPokemonId: boolean;
}

export type OpponentNoteValidationResult =
  | { ok: true; value: OpponentNoteRequestBody }
  | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAT_COUNT = 6;
const MAX_MOVE_COUNT = 4;
const MIN_LEVEL = 1;
const MAX_LEVEL = 100;
const VALID_GENDERS = new Set(['', 'male', 'female']);

const OPPONENT_BUILD_KEYS = new Set([
  'name',
  'level',
  'nature',
  'gender',
  'abilityName',
  'itemName',
  'moveNames',
  'teraType',
  'evs',
  'ivs',
]);

const OPPONENT_FIELD_KEYS = new Set(['weather', 'terrain', 'defenderSideFields', 'seed', 'critical']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStatArray(value: unknown, max: number): value is number[] {
  if (!Array.isArray(value) || value.length !== STAT_COUNT) return false;
  return value.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max);
}

function isMoveNamesArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_MOVE_COUNT) return false;
  return value.every((v) => typeof v === 'string');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

// opponent_build を検証する。許可されたキー(OPPONENT_BUILD_KEYS)以外が含まれる場合は拒否する
// (「PokemonSpec型に対応する任意項目のみを許容」という要件を検証段階でも徹底する)。
function validateOpponentBuild(value: unknown): { ok: true; value: OpponentBuildInput } | { ok: false; error: string } {
  if (!isPlainObject(value)) {
    return { ok: false, error: 'opponent_build must be a JSON object' };
  }
  for (const key of Object.keys(value)) {
    if (!OPPONENT_BUILD_KEYS.has(key)) {
      return { ok: false, error: `opponent_build contains an unknown key: ${key}` };
    }
  }

  const { name, level, nature, gender, abilityName, itemName, moveNames, teraType, evs, ivs } = value;

  if (!isNonEmptyString(name)) {
    return { ok: false, error: 'opponent_build.name must be a non-empty string' };
  }
  if (level !== undefined) {
    if (typeof level !== 'number' || !Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
      return { ok: false, error: `opponent_build.level must be an integer between ${MIN_LEVEL} and ${MAX_LEVEL}` };
    }
  }
  if (nature !== undefined && typeof nature !== 'string') {
    return { ok: false, error: 'opponent_build.nature must be a string' };
  }
  if (gender !== undefined && !VALID_GENDERS.has(gender as string)) {
    return { ok: false, error: 'opponent_build.gender must be "", "male", or "female"' };
  }
  if (abilityName !== undefined && typeof abilityName !== 'string') {
    return { ok: false, error: 'opponent_build.abilityName must be a string' };
  }
  if (itemName !== undefined && typeof itemName !== 'string') {
    return { ok: false, error: 'opponent_build.itemName must be a string' };
  }
  if (moveNames !== undefined && !isMoveNamesArray(moveNames)) {
    return { ok: false, error: 'opponent_build.moveNames must be an array of at most 4 strings' };
  }
  if (teraType !== undefined && teraType !== null && typeof teraType !== 'string') {
    return { ok: false, error: 'opponent_build.teraType must be a string or null' };
  }
  if (evs !== undefined && !isStatArray(evs, 32)) {
    return { ok: false, error: 'opponent_build.evs must be an array of 6 integers between 0 and 32' };
  }
  if (ivs !== undefined && !isStatArray(ivs, 31)) {
    return { ok: false, error: 'opponent_build.ivs must be an array of 6 integers between 0 and 31' };
  }

  const result: OpponentBuildInput = { name: name.trim() };
  if (level !== undefined) result.level = level;
  if (nature !== undefined) result.nature = nature;
  if (gender !== undefined) result.gender = gender as '' | 'male' | 'female';
  if (abilityName !== undefined) result.abilityName = abilityName;
  if (itemName !== undefined) result.itemName = itemName;
  if (moveNames !== undefined) result.moveNames = moveNames;
  if (teraType !== undefined) result.teraType = teraType;
  if (evs !== undefined) result.evs = evs;
  if (ivs !== undefined) result.ivs = ivs;
  return { ok: true, value: result };
}

// field を検証する。許可されたキー(OPPONENT_FIELD_KEYS)以外が含まれる場合は拒否する。
function validateOpponentField(value: unknown): { ok: true; value: OpponentFieldInput } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: {} };
  }
  if (!isPlainObject(value)) {
    return { ok: false, error: 'field must be a JSON object' };
  }
  for (const key of Object.keys(value)) {
    if (!OPPONENT_FIELD_KEYS.has(key)) {
      return { ok: false, error: `field contains an unknown key: ${key}` };
    }
  }

  const { weather, terrain, defenderSideFields, seed, critical } = value;

  if (weather !== undefined && typeof weather !== 'string') {
    return { ok: false, error: 'field.weather must be a string' };
  }
  if (terrain !== undefined && typeof terrain !== 'string') {
    return { ok: false, error: 'field.terrain must be a string' };
  }
  if (defenderSideFields !== undefined && !isStringArray(defenderSideFields)) {
    return { ok: false, error: 'field.defenderSideFields must be an array of strings' };
  }
  if (seed !== undefined && (typeof seed !== 'number' || !Number.isInteger(seed))) {
    return { ok: false, error: 'field.seed must be an integer' };
  }
  if (critical !== undefined && typeof critical !== 'boolean') {
    return { ok: false, error: 'field.critical must be a boolean' };
  }

  const result: OpponentFieldInput = {};
  if (weather !== undefined) result.weather = weather;
  if (terrain !== undefined) result.terrain = terrain;
  if (defenderSideFields !== undefined) result.defenderSideFields = defenderSideFields;
  if (seed !== undefined) result.seed = seed;
  if (critical !== undefined) result.critical = critical;
  return { ok: true, value: result };
}

export function validateOpponentNoteRequestBody(
  body: unknown,
  options: ValidateOpponentNoteOptions,
): OpponentNoteValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const { owned_pokemon_id, opponent_build, field, move_name, client_result, memo } = body;

  let ownedPokemonId: string | null = null;
  if (options.requireOwnedPokemonId) {
    if (typeof owned_pokemon_id !== 'string' || !UUID_PATTERN.test(owned_pokemon_id)) {
      return { ok: false, error: 'owned_pokemon_id must be a valid uuid string' };
    }
    ownedPokemonId = owned_pokemon_id;
  }

  const buildResult = validateOpponentBuild(opponent_build);
  if (!buildResult.ok) return buildResult;

  const fieldResult = validateOpponentField(field);
  if (!fieldResult.ok) return fieldResult;

  if (move_name !== undefined && move_name !== null && typeof move_name !== 'string') {
    return { ok: false, error: 'move_name must be a string' };
  }
  if (client_result !== undefined && client_result !== null && !isPlainObject(client_result)) {
    return { ok: false, error: 'client_result must be a JSON object' };
  }
  if (memo !== undefined && memo !== null && typeof memo !== 'string') {
    return { ok: false, error: 'memo must be a string' };
  }

  return {
    ok: true,
    value: {
      owned_pokemon_id: ownedPokemonId,
      opponent_build: buildResult.value,
      field: fieldResult.value,
      move_name: typeof move_name === 'string' ? (move_name.trim() === '' ? null : move_name.trim()) : null,
      client_result: (client_result as Record<string, unknown> | null | undefined) ?? null,
      memo: typeof memo === 'string' ? (memo.trim() === '' ? null : memo.trim()) : null,
    },
  };
}
