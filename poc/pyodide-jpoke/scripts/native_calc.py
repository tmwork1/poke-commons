"""jpokeをネイティブ実行してcalc_damages()の結果を出力するスクリプト。

ブラウザ(Pyodide)側の index.html と全く同じ攻撃側/防御側/技/シードで
Battle.calc_damages() を呼び、結果をJSON文字列として標準出力する。
Playwrightでのブラウザ実行結果との一致検証に使う。

実行例:
    C:\\Users\\tmtmp\\Documents\\pokemon\\jpoke\\.venv\\Scripts\\python.exe scripts\\native_calc.py
"""
import json

from jpoke import Battle, Player, Pokemon

player1 = Player("Player 1")
player1.team.append(Pokemon("ピカチュウ", move_names=["でんきショック"]))
player2 = Player("Player 2")
player2.team.append(Pokemon("フシギダネ"))

battle = Battle(player1, player2, seed=1)
battle.start()

attacker, defender = battle.actives
move = attacker.moves[0]
damages = battle.calc_damages(attacker, defender, move)

print(json.dumps(damages))
