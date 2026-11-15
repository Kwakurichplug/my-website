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
  purpose    text NOT NULL CHECK (purpose IN ('register','login','reset','email')),
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
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','rejected','cancelled')),
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

-- Casino-style games (instant games + Rocket Crash). Money moves through transactions; this is the game record.
CREATE TABLE IF NOT EXISTS game_bets (
  id         text PRIMARY KEY,                -- also the ledger ref; for Hi-Lo the deal nonce (replay-proof)
  user_id    uuid NOT NULL REFERENCES users(id),
  game       text NOT NULL,
  round      bigint,                          -- crash round number
  stake      numeric(14,2) NOT NULL CHECK (stake > 0),
  choice     jsonb,
  result     jsonb,
  auto       numeric(10,2),                   -- crash auto cash-out
  mult       numeric(10,2),
  payout     numeric(14,2) NOT NULL DEFAULT 0,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','cashed','void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS game_bets_user_idx ON game_bets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS game_bets_round_idx ON game_bets (game, round) WHERE status = 'open';

-- ===================== Games go live (all server-authoritative) =====================
-- game_bets may be voided (Rocket Crash bet cancelled before take-off)
-- (only touched when an older database still has the old list – no full-table re-check on every boot)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_bets_status_check' AND pg_get_constraintdef(oid) LIKE '%void%') THEN
    ALTER TABLE game_bets DROP CONSTRAINT IF EXISTS game_bets_status_check;
    ALTER TABLE game_bets ADD CONSTRAINT game_bets_status_check CHECK (status IN ('open','won','lost','cashed','void'));
  END IF;
END $$;
-- one live bet per player per crash round (a cancelled bet does not block a new one)
DROP INDEX IF EXISTS game_bets_one_per_round;
CREATE UNIQUE INDEX IF NOT EXISTS game_bets_one_live_per_round ON game_bets (game, round, user_id) WHERE round IS NOT NULL AND status <> 'void';

-- Rocket Crash: shared rounds. hash = sha256(seed) is public before betting opens; seed is revealed after the crash.
CREATE TABLE IF NOT EXISTS crash_rounds (
  id         bigserial PRIMARY KEY,
  hash       text NOT NULL,
  seed       text NOT NULL,
  point      numeric(10,2) NOT NULL,
  bet_from   timestamptz NOT NULL,
  starts_at  timestamptz NOT NULL,
  crash_at   timestamptz NOT NULL,
  settled    boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS crash_rounds_settled_idx ON crash_rounds (id) WHERE settled;

-- Weekly Jackpot: the server fixes the 12 games of a round; tickets are graded and paid automatically.
CREATE TABLE IF NOT EXISTS jackpot_rounds (
  id         serial PRIMARY KEY,
  code       text UNIQUE NOT NULL,
  event_ids  bigint[] NOT NULL,
  closes_at  timestamptz NOT NULL,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled')),
  outcomes   jsonb,              -- {eventId: {o:'1'|'X'|'2', drawn:bool}}
  summary    jsonb,              -- {NG:{t12:{lines,prize},t11:{…},t10:{…}}, GH:{…}}
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE TABLE IF NOT EXISTS jackpot_tickets (
  ref        text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id),
  round_id   int REFERENCES jackpot_rounds(id),     -- null = ticket bought before server rounds existed
  round_code text NOT NULL,
  country    char(2) NOT NULL,
  picks      jsonb NOT NULL,                        -- [{eventId, outcomes:[…]}] × 12
  lines      int NOT NULL,
  cost       numeric(14,2) NOT NULL,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  hits       jsonb,                                 -- lines per number of correct picks {"12":0,"11":1,"10":3}
  prize      numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS jackpot_tickets_user_idx ON jackpot_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jackpot_tickets_open_idx ON jackpot_tickets (round_id) WHERE status = 'open';
-- tickets bought before jackpot_tickets existed live only in the ledger: copy them once
INSERT INTO jackpot_tickets (ref, user_id, round_code, country, picks, lines, cost, created_at)
  SELECT t.ref, t.user_id, coalesce(t.meta->>'round', '?'), u.country, t.meta->'picks', coalesce((t.meta->>'lines')::int, 1), -t.amount, t.created_at
  FROM transactions t JOIN users u ON u.id = t.user_id
  WHERE t.type = 'jackpot' AND t.ref IS NOT NULL AND t.meta ? 'picks' AND NOT EXISTS (SELECT 1 FROM jackpot_tickets)
ON CONFLICT (ref) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('games', '{"NG":{"min":100,"max":500000},"GH":{"min":1,"max":5000}}'),
  ('jackpot', '{"NG":{"jackpot":50000000,"t11":100000,"t10":10000,"line":100},"GH":{"jackpot":500000,"t11":1000,"t10":100,"line":1}}')
ON CONFLICT (key) DO NOTHING;

-- ===================== Code Hub + Refer & Earn =====================
-- Code Hub: who booked a code (shown masked) and how many times it was loaded
ALTER TABLE booking_codes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
ALTER TABLE booking_codes ADD COLUMN IF NOT EXISTS uses int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS booking_codes_recent_idx ON booking_codes (created_at DESC);
-- Refer & Earn: the referrer is paid once, when the friend has staked at least the reward amount on sports bets
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_paid boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS users_referred_by_idx ON users (referred_by) WHERE referred_by IS NOT NULL;
INSERT INTO settings (key, value) VALUES ('referral', '{"NG":1000,"GH":10}') ON CONFLICT (key) DO NOTHING;

-- ===================== Welcome bonus (server/src/lib/bonus.js) =====================
CREATE TABLE IF NOT EXISTS bonuses (
  id          serial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  kind        text NOT NULL,                       -- 'welcome'
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  required    numeric(14,2) NOT NULL,              -- turnover needed to release
  wagered     numeric(14,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','expired','forfeited')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  released_at timestamptz,
  UNIQUE (user_id, kind)
);
INSERT INTO settings (key, value) VALUES
  ('welcome_bonus', '{"NG":{"pct":200,"max":100000},"GH":{"pct":200,"max":1000},"times":5,"min_odds":1.5,"days":14}')
ON CONFLICT (key) DO NOTHING;

-- Email sign-up: an account has a mobile number, an email address, or both. Emails are unique site-wide
-- (case-insensitive); codes can go to a phone or an email address.
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
UPDATE users SET email = lower(trim(email)) WHERE email IS NOT NULL AND email <> lower(trim(email));
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_contact_chk CHECK (phone IS NOT NULL OR email IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'users_email_key not created: two accounts share an email – fix them, it is retried on the next boot';
END $$;
ALTER TABLE otps ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE otps ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE otps ADD COLUMN IF NOT EXISTS user_id uuid;            -- set for codes sent to a signed-in player (email change)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'otps_purpose_check' AND pg_get_constraintdef(oid) NOT LIKE '%email%') THEN
    ALTER TABLE otps DROP CONSTRAINT otps_purpose_check;
    ALTER TABLE otps ADD CONSTRAINT otps_purpose_check CHECK (purpose IN ('register','login','reset','email'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS otps_email_idx ON otps (email, created_at DESC) WHERE email IS NOT NULL;
-- delivery log: sent (provider accepted it), logged (console provider), failed (with the reason)
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent';
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS error text;

-- market set v2 (markets.js): the two legacy European handicap rows are replaced by the 'eh' table on open events
DELETE FROM markets WHERE key IN ('eh-1','eh+1') AND event_id IN (SELECT id FROM events WHERE status IN ('scheduled','live'));

-- ---------------------------------------------------------------------------------------------------------
-- Payments MVP: manual deposits (admin confirms), Ghana Mobile Money through the payment API, admin action log
-- ---------------------------------------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_status_check' AND pg_get_constraintdef(oid) LIKE '%cancelled%') THEN
    ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
    ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('pending','success','failed','rejected','cancelled'));
  END IF;
END $$;
-- a provider reference belongs to one charge / payout
CREATE UNIQUE INDEX IF NOT EXISTS payments_paystack_ref_key ON payments (provider_ref) WHERE provider = 'paystack';
CREATE INDEX IF NOT EXISTS payments_pending_idx ON payments (kind, created_at) WHERE status = 'pending';
-- deposits started before manual / API payments existed never reached a provider and took no money: close them
UPDATE payments SET status = 'cancelled', updated_at = now(), details = details || '{"reason":"Not completed – no money was taken"}'::jsonb
  WHERE kind = 'deposit' AND status = 'pending' AND coalesce(provider, 'pending') = 'pending';
-- admin portal: every change an admin makes (who, which endpoint, on which record, with which values)
CREATE TABLE IF NOT EXISTS admin_log (
  id        bigserial PRIMARY KEY,
  admin_id  uuid NOT NULL REFERENCES users(id),
  action    text NOT NULL,
  target    text,
  meta      jsonb NOT NULL DEFAULT '{}',
  at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_log ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS admin_log_at ON admin_log (at DESC);
