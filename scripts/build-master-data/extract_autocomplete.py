"""jpoke のマスタデータ(POKEDEX / MOVES / ABILITIES / ITEMS)から、
オートコンプリート用の軽量 JSON を抽出するスクリプト。

jpoke の `src/` を直接 sys.path に追加して読み込む(jpoke はランタイム依存ゼロの
純 Python パッケージのため pip install 不要)。ITEMS/ABILITIES は Python コード内で
定義されており JSON 化されていないため、jpoke を import してランタイム上の辞書
(POKEDEX/MOVES/ABILITIES/ITEMS)を単一の情報源として利用する。

使い方:
    python extract_autocomplete.py <jpoke_src_dir> <output_dir>

出力:
    <output_dir>/pokemon.json
    <output_dir>/moves.json
    <output_dir>/abilities.json
    <output_dir>/items.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def _is_real_name(name: str) -> bool:
    """空文字センチネル("特性なし"等)や内部専用の擬似エントリ("_"始まり)を除外する。"""
    return bool(name) and not name.startswith("_")


def build_pokemon(pokedex: dict, raw_pokedex: dict) -> list[dict]:
    """POKEDEX から最低限の識別情報(図鑑番号・フォルム・タイプ)付きの一覧を作る。

    PokemonData オブジェクト自体には図鑑番号・フォルム名が保持されていないため、
    生の ps-champ-ja/pokedex.json (num/forme) を突き合わせて補完する。
    """
    result = []
    for name, data in pokedex.items():
        if not _is_real_name(name):
            continue
        raw = raw_pokedex.get(name, {})
        result.append(
            {
                "name": name,
                "dexNo": raw.get("num"),
                "forme": raw.get("forme") or None,
                "types": list(data.types),
            }
        )
    return result


def build_moves(moves: dict) -> list[dict]:
    """MOVES から最低限の識別情報(タイプ・分類)付きの一覧を作る。"""
    result = []
    for name, data in moves.items():
        if not _is_real_name(name):
            continue
        result.append(
            {
                "name": name,
                "type": data.type or None,
                "category": data.category or None,
            }
        )
    return result


def build_abilities(abilities: dict) -> list[dict]:
    """ABILITIES から名前一覧を作る(jpoke には特性の説明文データが無いため名前のみ)。"""
    return [{"name": name} for name in abilities if _is_real_name(name)]


def build_items(items: dict) -> list[dict]:
    """ITEMS から名前一覧を作る(jpoke には道具の説明文データが無いため名前のみ)。"""
    return [{"name": name} for name in items if _is_real_name(name)]


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: python extract_autocomplete.py <jpoke_src_dir> <output_dir>", file=sys.stderr)
        raise SystemExit(2)

    jpoke_src_dir = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()

    if not jpoke_src_dir.is_dir():
        print(f"jpoke のソースディレクトリが見つかりません: {jpoke_src_dir}", file=sys.stderr)
        raise SystemExit(1)

    sys.path.insert(0, str(jpoke_src_dir))

    from jpoke.data import ABILITIES, ITEMS, MOVES, POKEDEX  # noqa: E402

    # PokemonData には図鑑番号・フォルム名が保持されていないため、生の pokedex.json から補完する。
    with (jpoke_src_dir / "jpoke" / "data" / "ps-champ-ja" / "pokedex.json").open(encoding="utf-8") as f:
        raw_pokedex = json.load(f)

    output_dir.mkdir(parents=True, exist_ok=True)

    datasets = {
        "pokemon.json": build_pokemon(POKEDEX, raw_pokedex),
        "moves.json": build_moves(MOVES),
        "abilities.json": build_abilities(ABILITIES),
        "items.json": build_items(ITEMS),
    }

    for filename, records in datasets.items():
        path = output_dir / filename
        with path.open("w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, separators=(",", ":"))
        print(f"wrote {path} ({len(records)} records)")


if __name__ == "__main__":
    main()
