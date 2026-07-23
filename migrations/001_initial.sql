-- migrations/001_initial.sql
-- 初期スキーマ: 匿名イベントログ + 型付きテーブル (開発プラン §2.4)
-- 個人特定に繋がるIP/UAは保存しない。session_hash は日替わりソルト付きハッシュ (アプリ側で生成)。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 匿名イベントログ (append-only、全機能共通の蓄積基盤)
CREATE TABLE IF NOT EXISTS events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL, -- 'damage_calc' | 'build_save' | 'search' | 'compare' | ...
  payload jsonb NOT NULL DEFAULT '{}', -- イベント固有データ (計算条件、検索語 など)
  session_hash text NOT NULL, -- 匿名セッション識別子 (日次ローテーションのハッシュ、個人特定不可)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_session_hash ON events(session_hash);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

-- 型付きテーブル: ダメージ計算ログ (集計しやすいよう events と二重記録)
CREATE TABLE IF NOT EXISTS damage_calcs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attacker_name text NOT NULL,
  defender_name text NOT NULL,
  move_name text NOT NULL,
  attacker_build jsonb NOT NULL DEFAULT '{}',
  defender_build jsonb NOT NULL DEFAULT '{}',
  field jsonb NOT NULL DEFAULT '{}',
  client_result jsonb, -- クライアント(Pyodide)計算結果。UI表示用の未検証値、集計には使わない(§2.6)
  verified_result jsonb, -- GitHub Actions バッチが埋める検証済み結果 (Phase 5)
  session_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_damage_calcs_attacker ON damage_calcs(attacker_name);
CREATE INDEX IF NOT EXISTS idx_damage_calcs_defender ON damage_calcs(defender_name);
CREATE INDEX IF NOT EXISTS idx_damage_calcs_move ON damage_calcs(move_name);
CREATE INDEX IF NOT EXISTS idx_damage_calcs_session_hash ON damage_calcs(session_hash);
CREATE INDEX IF NOT EXISTS idx_damage_calcs_created_at ON damage_calcs(created_at);

-- 育成ビルド (保存・共有)
CREATE TABLE IF NOT EXISTS builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pokemon_name text NOT NULL,
  nature text,
  ability_name text,
  item_name text,
  tera_type text,
  evs jsonb NOT NULL DEFAULT '{}',
  ivs jsonb NOT NULL DEFAULT '{}',
  move_names text[] NOT NULL DEFAULT '{}',
  share_slug text UNIQUE,
  is_public boolean NOT NULL DEFAULT false,
  session_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builds_pokemon_name ON builds(pokemon_name);
CREATE INDEX IF NOT EXISTS idx_builds_session_hash ON builds(session_hash);
CREATE INDEX IF NOT EXISTS idx_builds_is_public ON builds(is_public);

-- 検索ログ
CREATE TABLE IF NOT EXISTS searches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query text NOT NULL,
  category text,
  hit_count int,
  session_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_searches_session_hash ON searches(session_hash);
CREATE INDEX IF NOT EXISTS idx_searches_created_at ON searches(created_at);

-- 集計結果 (cron ジョブ / GitHub Actions バッチが書き込み、閲覧 API は読むだけ)
CREATE TABLE IF NOT EXISTS suggestions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL, -- 'popular_build' | 'common_opponent' | 'ev_trend' | 'trending_search' など
  subject_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suggestions_kind ON suggestions(kind);
CREATE INDEX IF NOT EXISTS idx_suggestions_subject_key ON suggestions(subject_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suggestions_kind_subject ON suggestions(kind, subject_key);
