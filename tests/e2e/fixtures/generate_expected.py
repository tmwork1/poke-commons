#!/usr/bin/env python3
"""Phase 2-5 E2E回帰テスト用の期待値(ネイティブjpoke実行結果)を生成するスクリプト。

`cases.json` に定義した各テストケース(攻撃側/防御側ポケモン・技・seed・フィールド状態など)を、
`src/lib/pyodide-engine.ts` の BOOTSTRAP_PYTHON (`calc_damages_json`) と全く同じ手順で
ネイティブ Python 上の jpoke で実行し、結果を `expected.json` に書き出す。

ブラウザ(Pyodide)側は BOOTSTRAP_PYTHON という固定のPythonコードを介して
`Battle.calc_damages()` / `Battle.calc_lethal()` を呼ぶ。このスクリプトは同じ手順を
ネイティブ側で再現することで、「ブラウザで動かした結果」と「ネイティブで動かした結果」の
期待値を用意する。実際の一致検証は Playwright (tests/e2e/damage-calc.spec.ts) が
ブラウザ側の calcDamages() 呼び出し結果とこの expected.json を突き合わせて行う。

再生成方法(jpoke 更新時など):
    python tests/e2e/fixtures/generate_expected.py

既定では `vendor/jpoke/src` を jpoke の実装として使う(public/master-data の wheel と
同じソース)。`../jpoke/src` 等、別の jpoke ソースで試したい場合は JPOKE_SRC_DIR
環境変数で上書きできる。
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = Path(__file__).resolve().parent

DEFAULT_JPOKE_SRC = REPO_ROOT / "vendor" / "jpoke" / "src"
JPOKE_SRC_DIR = Path(os.environ.get("JPOKE_SRC_DIR", str(DEFAULT_JPOKE_SRC)))

if not JPOKE_SRC_DIR.is_dir():
    raise SystemExit(f"jpokeのソースが見つかりません: {JPOKE_SRC_DIR}")

sys.path.insert(0, str(JPOKE_SRC_DIR))

from jpoke import Battle, Player, Pokemon  # noqa: E402


def _build_pokemon(spec: dict, fallback_move_name: str | None) -> Pokemon:
    """src/lib/pyodide-engine.ts の BOOTSTRAP_PYTHON `_build_pokemon` と同一の手順。"""
    move_names = spec.get("moveNames") or None
    if not move_names:
        move_names = [fallback_move_name] if fallback_move_name else ["はねる"]

    level = spec.get("level")
    pokemon = Pokemon(
        spec["name"],
        gender=spec.get("gender") or "",
        nature=spec.get("nature") or "まじめ",
        level=level if level is not None else 50,
        ability_name=spec.get("abilityName") or "",
        item_name=spec.get("itemName") or "",
        move_names=list(move_names),
        tera_type=spec.get("teraType") or None,
    )

    evs = spec.get("evs")
    if evs is not None:
        pokemon.set_evs(list(evs))
    ivs = spec.get("ivs")
    if ivs is not None:
        pokemon.set_ivs(list(ivs))

    return pokemon


def _apply_field(battle: Battle, defender_player: Player, field_spec: dict) -> None:
    """BOOTSTRAP_PYTHON `_apply_field` と同一の手順。"""
    weather = field_spec.get("weather")
    if weather:
        battle.set_weather(weather, 5)

    terrain = field_spec.get("terrain")
    if terrain:
        battle.set_terrain(terrain, 5)

    for name in field_spec.get("defenderSideFields") or []:
        battle.activate_side_field(defender_player, name, 5)


def calc_damages_json(case: dict) -> dict:
    """BOOTSTRAP_PYTHON `calc_damages_json` と同一の手順。戻り値の型もJS側と揃える。"""
    attacker_spec = case["attacker"]
    defender_spec = case["defender"]
    move_name = case["moveName"]
    seed = case.get("seed")
    critical = case.get("critical", False)
    field_spec = case.get("field") or {}
    max_lethal_attack_count = case.get("maxLethalAttackCount", 6)

    player1 = Player("Attacker")
    attacker = _build_pokemon(attacker_spec, move_name)
    player1.team.append(attacker)

    player2 = Player("Defender")
    defender = _build_pokemon(defender_spec, None)
    player2.team.append(defender)

    battle = Battle(player1, player2, seed=seed)
    battle.start()
    _apply_field(battle, player2, field_spec)

    active_attacker, active_defender = battle.actives
    move = next(
        (m for m in active_attacker.moves if m.name == move_name),
        active_attacker.moves[0],
    )
    damages = battle.calc_damages(active_attacker, active_defender, move, critical=critical)

    lethal_results = battle.calc_lethal(
        active_attacker, move, critical=critical, max_attack=max_lethal_attack_count
    )
    lethal = [
        {"attackCount": result.attack_count, "probability": result.lethal_probability}
        for result in lethal_results
    ]

    return {"damages": damages, "lethal": lethal}


def main() -> None:
    cases = json.loads((FIXTURES_DIR / "cases.json").read_text(encoding="utf-8"))

    expected: dict[str, dict] = {}
    for case in cases:
        case_id = case["id"]
        print(f"計算中: {case_id} ({case['description']})")
        expected[case_id] = calc_damages_json(case)

    out_path = FIXTURES_DIR / "expected.json"
    out_path.write_text(
        json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\n書き出し完了: {out_path} ({len(expected)}件)")


if __name__ == "__main__":
    main()
