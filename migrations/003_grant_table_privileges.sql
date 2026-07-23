-- migrations/003_grant_table_privileges.sql
-- 002_enable_rls.sql で RLS ポリシーを追加したが、Postgres のテーブル権限 (GRANT) 自体は
-- 別物であり付与していなかった。ローカル Supabase の public スキーマのデフォルト権限
-- (role postgres の default privileges) は anon/authenticated/service_role に対して
-- TRUNCATE/REFERENCES/TRIGGER のみを与える設定になっており、SELECT/INSERT/UPDATE/DELETE は
-- 一切許可されていない。そのため RLS ポリシーの有無に関わらず「permission denied for table」に
-- なっていた (実機検証で判明: POST /api/events が service_role 接続でも INSERT できなかった)。
--
-- RLS ポリシーは「許可された操作の対象行を絞り込む」ものであり、GRANT の代替にはならない。
-- ここで 002 のポリシー方針 (§2.4: 閲覧は anon/authenticated に SELECT のみ、書き込みは
-- service_role 経由の API のみ) に対応する基礎権限を明示的に付与する。

-- 閲覧ロール: 002 の *_public_read ポリシーに対応する SELECT 権限。
GRANT SELECT ON events, damage_calcs, builds, searches, suggestions TO anon, authenticated;

-- service_role: RLS を常にバイパスするが、テーブルへの DML 自体は別途 GRANT が必要。
GRANT SELECT, INSERT, UPDATE, DELETE ON events, damage_calcs, builds, searches, suggestions TO service_role;

-- bigint GENERATED ALWAYS AS IDENTITY 列 (events/damage_calcs/searches/suggestions) は内部的に
-- シーケンスへの USAGE/SELECT 権限が無いと INSERT 時に "permission denied for sequence" になる。
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
