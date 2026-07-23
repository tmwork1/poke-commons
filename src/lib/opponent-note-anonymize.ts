// owned_pokemon/opponent_notes(本人限定・非公開)から damage_calcs/events(既存・匿名・集合知)向けの
// ペイロードへ変換する、唯一のホワイトリスト方式匿名化関数(育成データ管理計画.md §4.3・§8 Phase D-2)。
//
// ##### 最重要: ホワイトリスト方式を厳守すること(ブラックリスト方式は絶対に使わない) #####
// - `{...ownedPokemon}` `{...opponentNote}` のような丸ごとスプレッドは絶対に書かない。
// - 参照してよいフィールドは、下記の2つの destructure 文でのみ owned_pokemon/opponent_notes から
//   値を取り出す。この2行の外で ownedPokemon/opponentNote のプロパティに触れないこと。
//   - owned_pokemon から渡してよい: species_name・nature・ability_name・item_name・tera_type・
//     evs・ivs・move_names のみ。渡してはいけない: id・user_id・nickname・tags・is_pinned・memo・
//     source_build_slug・created_at・updated_at・last_used_at
//   - opponent_notes から渡してよい: opponent_build・field・move_name・client_result のみ。
//     渡してはいけない: id・owned_pokemon_id・user_id・memo・created_at・updated_at
// - opponent_build/field は呼び出し元のバリデーションを経由しない可能性(直接このファイルを
//   テストで呼ぶ場合など)も考慮し、この関数自身が改めてキー単位でホワイトリストコピーする
//   (validate関数の存在に依存しない、最後の砦としての実装)。
//
// テスト: tests/opponent-note-anonymize.test.ts で、入力オブジェクトに user_id・nickname・tags・
// is_pinned・memo・owned_pokemon_id 等のホワイトリスト外フィールドを混入させても、出力の
// どこにも(トップレベルはもちろん attacker_build/defender_build/field の中にも)現れないことを
// 検証している。

// ownedPokemon/opponentNote の引数型は、呼び出し元(src/lib/owned-pokemon.ts の
// OwnedPokemonRecord・src/lib/opponent-notes.ts の OpponentNoteRecord)が持つ全フィールドを
// 許容しつつ(呼び出し側の実際のレコード型をそのまま渡せるように)、この関数はそのうち
// 明示したホワイトリストのフィールドしか読まない。
export interface OwnedPokemonAnonymizeSource {
  species_name: string;
  nature: string | null;
  ability_name: string | null;
  item_name: string | null;
  tera_type: string | null;
  evs: unknown;
  ivs: unknown;
  move_names: unknown;
  // 呼び出し元の実レコード(OwnedPokemonRecord)には id/user_id/nickname 等も含まれるが、
  // この関数は決してそれらを参照しない(上記コメント参照)。TypeScript的に受け取れるよう
  // 追加フィールドの存在は許容する。
  [key: string]: unknown;
}

export interface OpponentNoteAnonymizeSource {
  opponent_build: unknown;
  field: unknown;
  move_name: string | null;
  client_result: Record<string, unknown> | null;
  // opponentNote実レコード(OpponentNoteRecord)には id/owned_pokemon_id/user_id/memo 等も
  // 含まれるが、この関数は決してそれらを参照しない(上記コメント参照)。
  [key: string]: unknown;
}

export interface AnonymizedOpponentNotePayload {
  attacker_name: string;
  defender_name: string;
  move_name: string | null;
  attacker_build: Record<string, unknown>;
  defender_build: Record<string, unknown>;
  field: Record<string, unknown>;
  client_result: Record<string, unknown> | null;
}

const DEFENDER_NAME_FALLBACK = '不明';

// PokemonSpec(src/lib/pyodide-engine.ts)が認識するキーのみを許容する。
const POKEMON_SPEC_KEYS = ['name', 'level', 'nature', 'gender', 'abilityName', 'itemName', 'moveNames', 'teraType', 'evs', 'ivs'] as const;

// FieldSpec(src/lib/pyodide-engine.ts)が認識するキー + calcDamages() のオプション(seed/critical)。
const FIELD_SPEC_KEYS = ['weather', 'terrain', 'defenderSideFields', 'seed', 'critical'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// source からキー単位でホワイトリストコピーする(未知のキー・null/undefinedの値は出力に含めない)。
function whitelistCopy(source: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!isPlainObject(source)) return result;
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (value === undefined || value === null) continue;
    result[key] = value;
  }
  return result;
}

/**
 * owned_pokemon(本人限定)+ opponent_notes(本人限定)から、damage_calcs/events(既存・匿名)へ
 * そのまま挿入できる形のペイロードを組み立てる(session_hash は呼び出し元が別途付与する)。
 */
export function anonymizeOpponentNote(
  ownedPokemon: OwnedPokemonAnonymizeSource,
  opponentNote: OpponentNoteAnonymizeSource,
): AnonymizedOpponentNotePayload {
  // ##### owned_pokemon から参照してよいフィールドはこの1行のみ #####
  const { species_name, nature, ability_name, item_name, tera_type, evs, ivs, move_names } = ownedPokemon;
  // ##### opponent_notes から参照してよいフィールドはこの1行のみ #####
  const { opponent_build, field, move_name, client_result } = opponentNote;

  // attacker_build: 自分側(owned_pokemon)を PokemonSpec 形状に組み立てる。値が null のキーは省略する。
  const attacker_build: Record<string, unknown> = { name: species_name };
  if (nature != null) attacker_build.nature = nature;
  if (ability_name != null) attacker_build.abilityName = ability_name;
  if (item_name != null) attacker_build.itemName = item_name;
  if (tera_type != null) attacker_build.teraType = tera_type;
  if (evs != null) attacker_build.evs = evs;
  if (ivs != null) attacker_build.ivs = ivs;
  if (move_names != null) attacker_build.moveNames = move_names;

  // defender_build: opponent_build から PokemonSpec の既知キーのみをホワイトリストコピーする。
  const defender_build = whitelistCopy(opponent_build, POKEMON_SPEC_KEYS);

  const defenderNameRaw = isPlainObject(opponent_build) ? opponent_build.name : undefined;
  const defender_name =
    typeof defenderNameRaw === 'string' && defenderNameRaw.trim() !== '' ? defenderNameRaw : DEFENDER_NAME_FALLBACK;

  // field: opponent_notes.field から FieldSpec の既知キー + seed・critical のみをホワイトリストコピーする。
  const anonymizedField = whitelistCopy(field, FIELD_SPEC_KEYS);

  return {
    attacker_name: species_name,
    defender_name,
    move_name: move_name ?? null,
    attacker_build,
    defender_build,
    field: anonymizedField,
    // client_result: UI表示用の未検証値という既存の位置づけを踏襲し、そのまま渡す(集計には使わない)。
    client_result: client_result ?? null,
  };
}
