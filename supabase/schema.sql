-- Deep Shaft Syndicate - Supabase Schema
-- Run this in Supabase SQL Editor after creating your project

-- ── Profiles ──
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  display_name text
);

-- ── Saves ──
CREATE TABLE IF NOT EXISTS saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  slot int NOT NULL CHECK (slot >= 0 AND slot <= 4),
  name text NOT NULL DEFAULT 'Slot',
  data jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, slot)
);

-- ── Achievements ──
CREATE TABLE IF NOT EXISTS achievements (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_saves_user_id ON saves(user_id);
CREATE INDEX IF NOT EXISTS idx_saves_user_slot ON saves(user_id, slot);
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);

-- ── RLS Policies ──

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

-- Profiles: users can select/insert/update only their own row
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Saves: users can select/insert/update/delete only their own rows
CREATE POLICY "Users can view own saves"
  ON saves FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saves"
  ON saves FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saves"
  ON saves FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saves"
  ON saves FOR DELETE
  USING (auth.uid() = user_id);

-- Achievements: users can select/insert only their own rows
CREATE POLICY "Users can view own achievements"
  ON achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
  ON achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── Helper function for daily contract seed ──
CREATE OR REPLACE FUNCTION get_daily_seed()
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT (EXTRACT(EPOCH FROM CURRENT_DATE) / 86400)::int;
$$;
