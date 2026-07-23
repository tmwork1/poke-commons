// /api/owned-pokemon・/api/owned-pokemon/:id のリクエストボディ検証ロジック。
// Astro/Cloudflare ランタイムに依存しない純粋な関数として切り出し、node --test で
// ユニットテストできるようにする（src/lib/build-validation.ts と同じ方針）。
//
// PUT(更新)は「全項目を毎回送る」楽観的自動保存の設計(育成データ管理計画.md §6.2)のため、
// POST(新規作成)と同じ形の全項目バリデーションを共有する(build-validation.ts と同様、
// evs/ivs は builds と同じ「6要素配列」形式に統一する。オブジェクト形式にはしない)。

export interface OwnedPokemonRequestBody {
  nickname: string | null;
  species_name: string;
  level: number | null;
  nature: string | null;
  ability_name: string | null;
  item_name: string | null;
  tera_type: string | null;
  // Champions形式 [HP, 攻撃, 防御, 特攻, 特防, 素早さ]、各0〜32。省略時は全0(builds.evsと同形式)。
  evs: number[];
  // 同順、各0〜31。省略時は全31。
  ivs: number[];
  // 最大4件。省略時は空配列。
  move_names: string[];
  memo: string | null;
  tags: string[];
  is_pinned: boolean;
}

export type OwnedPokemonValidationResult =
  | { ok: true; value: OwnedPokemonRequestBody }
  | { ok: false; error: string };

const STAT_COUNT = 6;
const DEFAULT_EVS = [0, 0, 0, 0, 0, 0];
const DEFAULT_IVS = [31, 31, 31, 31, 31, 31];
const MAX_MOVE_COUNT = 4;
const MIN_LEVEL = 1;
const MAX_LEVEL = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// evs/ivs 用: 長さ6の数値配列で、各要素が [0, max] の整数であることを検証する。
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

// 空文字は「未指定/クリア」として null に正規化する(フォームの自動保存が毎回全項目を
// 送ってくる設計上、空欄に戻された項目を null として保存できるようにするため)。
function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function validateOwnedPokemonRequestBody(body: unknown): OwnedPokemonValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const {
    nickname,
    species_name,
    level,
    nature,
    ability_name,
    item_name,
    tera_type,
    evs,
    ivs,
    move_names,
    memo,
    tags,
    is_pinned,
  } = body;

  if (!isNonEmptyString(species_name)) {
    return { ok: false, error: 'species_name must be a non-empty string' };
  }
  if (nickname !== undefined && nickname !== null && typeof nickname !== 'string') {
    return { ok: false, error: 'nickname must be a string' };
  }
  if (level !== undefined && level !== null) {
    if (typeof level !== 'number' || !Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
      return { ok: false, error: `level must be an integer between ${MIN_LEVEL} and ${MAX_LEVEL}` };
    }
  }
  if (nature !== undefined && nature !== null && typeof nature !== 'string') {
    return { ok: false, error: 'nature must be a string' };
  }
  if (ability_name !== undefined && ability_name !== null && typeof ability_name !== 'string') {
    return { ok: false, error: 'ability_name must be a string' };
  }
  if (item_name !== undefined && item_name !== null && typeof item_name !== 'string') {
    return { ok: false, error: 'item_name must be a string' };
  }
  if (tera_type !== undefined && tera_type !== null && typeof tera_type !== 'string') {
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
  if (memo !== undefined && memo !== null && typeof memo !== 'string') {
    return { ok: false, error: 'memo must be a string' };
  }
  if (tags !== undefined && !isStringArray(tags)) {
    return { ok: false, error: 'tags must be an array of strings' };
  }
  if (is_pinned !== undefined && typeof is_pinned !== 'boolean') {
    return { ok: false, error: 'is_pinned must be a boolean' };
  }

  return {
    ok: true,
    value: {
      nickname: typeof nickname === 'string' ? normalizeOptionalString(nickname) : null,
      species_name: species_name.trim(),
      level: (level as number | undefined) ?? null,
      nature: typeof nature === 'string' ? normalizeOptionalString(nature) : null,
      ability_name: typeof ability_name === 'string' ? normalizeOptionalString(ability_name) : null,
      item_name: typeof item_name === 'string' ? normalizeOptionalString(item_name) : null,
      tera_type: typeof tera_type === 'string' ? normalizeOptionalString(tera_type) : null,
      evs: (evs as number[] | undefined) ?? DEFAULT_EVS,
      ivs: (ivs as number[] | undefined) ?? DEFAULT_IVS,
      move_names: (move_names as string[] | undefined) ?? [],
      memo: typeof memo === 'string' ? normalizeOptionalString(memo) : null,
      tags: ((tags as string[] | undefined) ?? []).map((t) => t.trim()).filter((t) => t.length > 0),
      is_pinned: (is_pinned as boolean | undefined) ?? false,
    },
  };
}
