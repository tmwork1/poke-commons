// src/pages/mypage/new.astro・src/pages/mypage/[id].astro が共有するブラウザ専用のフォーム
// ヘルパー(育成データ管理計画.md §8 Phase C-3・C-4)。
// src/pages/builds/new.astro の loadAutocomplete()/readEv()/readIv() 等と同じ実装パターン。
// SSR環境(Astroのフロントマター)からは呼び出さないこと(document/fetchに依存する)。

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export const MOVE_SLOTS = [1, 2, 3, 4];

export function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`要素が見つかりません: #${id}`);
  }
  return found as T;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function readEv(stat: string): number {
  const raw = Number(el<HTMLInputElement>(`ev-${stat}`).value);
  if (!Number.isFinite(raw)) return 0;
  return clamp(raw, 0, 32);
}

export function readIv(stat: string): number {
  const raw = el<HTMLInputElement>(`iv-${stat}`).value.trim();
  if (raw === '') return 31;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 31;
  return clamp(n, 0, 31);
}

export function readMoveNames(): string[] {
  return MOVE_SLOTS.map((slot) => el<HTMLInputElement>(`move-${slot}`).value.trim()).filter((name) => name !== '');
}

// タグ入力はカンマ区切りの簡易テキスト入力(育成データ管理計画.md §8 Phase C-3)。
export function parseTagsInput(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function formatTagsForInput(tags: string[]): string {
  return tags.join(', ');
}

async function fillDatalist(res: Response, datalistId: string): Promise<void> {
  const list = (await res.json()) as Array<{ name: string }>;
  const datalist = el<HTMLDataListElement>(datalistId);
  const fragment = document.createDocumentFragment();
  for (const { name } of list) {
    const option = document.createElement('option');
    option.value = name;
    fragment.appendChild(option);
  }
  datalist.appendChild(fragment);
}

// オートコンプリート用の軽量JSON(build:master-data 生成物)を datalist に反映する
// (育成データ管理計画.md §6.3・§8 Phase C-4。src/pages/builds/new.astro と同じデータソース)。
export async function loadAutocomplete(): Promise<void> {
  try {
    const [pokemonRes, moveRes, abilityRes, itemRes] = await Promise.all([
      fetch('/master-data/autocomplete/pokemon.json'),
      fetch('/master-data/autocomplete/moves.json'),
      fetch('/master-data/autocomplete/abilities.json'),
      fetch('/master-data/autocomplete/items.json'),
    ]);
    await Promise.all([
      fillDatalist(pokemonRes, 'pokemon-list'),
      fillDatalist(moveRes, 'move-list'),
      fillDatalist(abilityRes, 'ability-list'),
      fillDatalist(itemRes, 'item-list'),
    ]);
  } catch (err) {
    console.warn('オートコンプリート用データの読み込みに失敗しました', err);
  }
}

// ポケモン名を /pokemon/[name] へのURLパスセグメントへ変換する際の既知の例外
// (src/lib/pokemon-slug.ts と同じ処理。SSR専用の toPokemonPathSegment をブラウザ側の
// 軽量スクリプトに再import するほどではないため、ここでは同じロジックを直接持つ)。
export function toPokemonPathSegment(name: string): string {
  return name.replace(/[%:]/g, '');
}

export function pokemonDetailHref(name: string): string {
  return `/pokemon/${encodeURIComponent(toPokemonPathSegment(name))}`;
}

export function moveDetailHref(name: string): string {
  return `/moves/${encodeURIComponent(name)}`;
}
