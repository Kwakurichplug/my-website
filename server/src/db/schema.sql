-- LetBetAfrika schema. Idempotent: safe to run on every start.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid           bigint UNIQUE NOT NULL,                 -- short public id shown in the app
  country       char(2) NOT NULL CHECK (country IN ('NG','GH')),
  phone         text NOT NULL,                          -- national digits, no leading 0
  email         text,
  password_hash text NOT NULL,
  full_name     text,
  verified      boolean NOT NULL DEFAULT false,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','self_excluded')),
  balance       numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  limits        jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, phone)
);
CREATE SEQUENCE IF NOT EXISTS users_uid_seq START 10000001;

CREATE TABLE IF NOT EXISTS otps (
  id         bigserial PRIMARY KEY,
  country    char(2) NOT NULL,
  phone      text NOT NULL,
  code_hash  text NOT NULL,
  purpose    text NOT NULL CHECK (purpose IN ('register','login','reset')),
  expires_at timestamptz NOT NULL,
  used       boolean NOT NULL DEFAULT false,
  attempts   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otps_phone_idx ON otps (country, phone, created_at DESC);

-- Money ledger: every balance change is a row. users.balance is the cached sum.
CREATE TABLE IF NOT EXISTS transactions (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  type        text NOT NULL,            -- deposit, withdrawal, bet, win, refund, cashout, bonus, adjustment, game_bet, game_win
  amount      numeric(14,2) NOT NULL,   -- signed
  balance_after numeric(14,2) NOT NULL,
  ref         text,                     -- bet id, payment ref, etc.
  meta        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tx_user_idx ON transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  kind        text NOT NULL CHECK (kind IN ('deposit','withdrawal')),
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  method      text NOT NULL,
  provider    text,
  provider_ref text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','rejected')),
  details     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC);

-- Sports data
CREATE TABLE IF NOT EXISTS leagues (
  id       serial PRIMARY KEY,
  sport    text NOT NULL,
  name     text NOT NULL,
  country  text NOT NULL,
  flag     text,                        -- icon code used by the front end (eng, ng, gh, ...)
  top      boolean NOT NULL DEFAULT false,
  ext_id   text UNIQUE                  -- id in the odds feed
);

CREATE TABLE IF NOT EXISTS events (
  id          bigint PRIMARY KEY,       -- shown to users as "ID 10429"
  ext_id      text UNIQUE,
  sport       text NOT NULL,
  league_id   int NOT NULL REFERENCES leagues(id),
  home        text NOT NULL,
  away        text NOT NULL,
  home_logo   text,
  away_logo   text,
  kickoff     timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished','cancelled')),
  minute      int NOT NULL DEFAULT 0,
  period      text,
  score_home  int NOT NULL DEFAULT 0,
  score_away  int NOT NULL DEFAULT 0,
  ht_home     int, ht_away int,
  stats       jsonb NOT NULL DEFAULT '{}',
  hot         boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_kick_idx ON events (status, kickoff);
CREATE SEQUENCE IF NOT EXISTS events_id_seq START 10421;

-- One row per market, outcomes stored as jsonb {key:{l:label,o:price|null}}
CREATE TABLE IF NOT EXISTS markets (
  event_id   bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  key        text NOT NULL,             -- 1x2, dc, ou, cs ...
  name       text NOT NULL,
  grp        text NOT NULL,
  cols       int NOT NULL DEFAULT 3,
  outcomes   jsonb NOT NULL,
  suspended  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, key)
);

-- Betting
CREATE TABLE IF NOT EXISTS bets (
  id          text PRIMARY KEY,          -- ticket code e.g. T1A2B3C4
  user_id     uuid NOT NULL REFERENCES users(id),
  type        text NOT NULL CHECK (type IN ('single','multiple')),
  stake       numeric(14,2) NOT NULL CHECK (stake > 0),
  odds        numeric(12,4) NOT NULL,
  boost_pct   int NOT NULL DEFAULT 0,
  potential   numeric(14,2) NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','void','cashout')),
  paid        numeric(14,2),
  placed_at   timestamptz NOT NULL DEFAULT now(),
  settled_at  timestamptz
);
CREATE INDEX IF NOT EXISTS bets_user_idx ON bets (user_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS bets_open_idx ON bets (status) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS bet_legs (
  id          bigserial PRIMARY KEY,
  bet_id      text NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  event_id    bigint NOT NULL REFERENCES events(id),
  market_key  text NOT NULL,
  outcome_key text NOT NULL,
  label       text NOT NULL,
  market_name text NOT NULL,
  match_name  text NOT NULL,
  odd         numeric(10,2) NOT NULL,
  result      text CHECK (result IN ('won','lost','void'))
);
CREATE INDEX IF NOT EXISTS legs_event_idx ON bet_legs (event_id) WHERE result IS NULL;

CREATE TABLE IF NOT EXISTS booking_codes (
  code       text PRIMARY KEY,
  selections jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('margin', '0.94'),
  ('min_stake', '{"NG":100,"GH":1}'),
  ('max_payout', '{"NG":50000000,"GH":500000}'),
  ('boost', '[[3,5],[5,50],[10,200],[15,500],[20,1000]]')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS email_log (
  id        bigserial PRIMARY KEY,
  user_id   uuid REFERENCES users(id),
  template  text NOT NULL,
  subject   text NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;

-- Real odds feed: calibrated goal-model parameters per event (server-only, never sent to clients)
ALTER TABLE events ADD COLUMN IF NOT EXISTS model jsonb;
-- Team crest cache (TheSportsDB lookups by team name)
CREATE TABLE IF NOT EXISTS team_logos (
  name       text PRIMARY KEY,
  url        text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_league_status_idx ON events (league_id, status);
CREATE INDEX IF NOT EXISTS bet_legs_event_open_idx ON bet_legs (event_id) WHERE result IS NULL;
