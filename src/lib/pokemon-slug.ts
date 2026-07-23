// ポケモン名を /pokemon/<name> のURLパスセグメントとして使う際の変換ヘルパー。
//
// 以下2種の既知の例外(pokemon.json 全1290件中いずれもごく少数)に対応するため、
// URLパスセグメントとして使う場合に限り該当文字を取り除く。ページ内の表示名
// (JSONの name フィールドそのもの)は元の値のまま変更しない。
//   1. "%"(例:「ジガルデ(50%)」「ジガルデ(10%)」):
//      @astrojs/cloudflare のprerender機構が候補パスを `new URL()` へ通して
//      往復検証する際に decodeURI() を使うため、生の "%" が不正なパーセント
//      エンコーディングとしてビルド失敗の原因になる(WHATWG URLパーサは非ASCII文字は
//      パーセントエンコードする一方、単独の "%" はそのまま素通りさせてしまうため)。
//   2. ":"(例:「タイプ:ヌル」):
//      静的ビルド出力先のディレクトリ名として使われるため、Windows環境では
//      予約文字でビルド(mkdir)が失敗する。
export function toPokemonPathSegment(name: string): string {
	return name.replace(/[%:]/g, '');
}
