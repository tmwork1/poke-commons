-- migrations/002_enable_rls.sql
-- 全テーブルRLSをPhase 1の最初から有効化 (開発プラン §2.4、poke-research の 027_enable_rls.sql
-- が後付けになった教訓を踏まえる)。
--
-- poke-commons はログイン無しの完全匿名サービスのため、poke-research の
-- bookmarks_select_own / users_select_own のような auth.uid() ベースの「本人限定」ポリシーは
-- 存在しない。書き込みは全て SUPABASE_SECRET_KEY (service_role、RLSを常にバイパスする) を使う
-- サーバ側APIのみが行うため、匿名(anon)/認証済み(authenticated)ロール向けの書き込みポリシーは
-- 一切作らない。ここで許可するのは公開閲覧用の SELECT のみ。

-- events: 匿名イベントログ。当面はダッシュボード等での参照を想定し閲覧のみ許可。
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_public_read ON events FOR SELECT TO anon, authenticated USING (true);

-- damage_calcs: 計算条件は公開閲覧可。client_result/verified_result も同じ行に同居するが、
-- 集計に使うのは検証済みの verified_result のみ (§2.6)。行単位のフィルタは不要。
ALTER TABLE damage_calcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY damage_calcs_public_read ON damage_calcs FOR SELECT TO anon, authenticated USING (true);

-- builds: is_public = true の行のみ公開SELECT可能。非公開ビルドは service_role 経由のみ読める。
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;
CREATE POLICY builds_public_read ON builds FOR SELECT TO anon, authenticated USING (is_public = true);

-- searches: 検索ログ。「最近注目されているもの」等の集計元として閲覧のみ許可。
ALTER TABLE searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY searches_public_read ON searches FOR SELECT TO anon, authenticated USING (true);

-- suggestions: 集計結果の閲覧用テーブル。書き込みは cron ジョブ / GitHub Actions バッチが
-- service_role 経由で行う。
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY suggestions_public_read ON suggestions FOR SELECT TO anon, authenticated USING (true);
