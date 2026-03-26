-- Pjak v2: Permanent eggs, replayable sessions
-- Run this in Supabase SQL Editor

-- Permanent egg locations (placed once, reused across all games)
create table if not exists eggs (
  id uuid primary key default gen_random_uuid(),
  idx int not null, -- order in the hunt
  label text not null, -- e.g. "Vid stora eken"
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz default now()
);

-- Game sessions (each replay is a new session)
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Påskjakt',
  current_egg_index int not null default 0,
  status text not null default 'active', -- active, finished
  created_at timestamptz default now()
);

-- Session eggs (links a game session to eggs, with a unique code per session)
create table if not exists session_eggs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  egg_id uuid references eggs(id) on delete cascade,
  idx int not null,
  code text not null, -- fresh code generated per session
  collected boolean not null default false
);

-- Player position (updated by phone, one row per game)
create table if not exists player_position (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade unique,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz default now()
);

-- Enable realtime
alter publication supabase_realtime add table eggs;
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table session_eggs;
alter publication supabase_realtime add table player_position;

-- RLS policies (permissive for v1)
alter table eggs enable row level security;
alter table games enable row level security;
alter table session_eggs enable row level security;
alter table player_position enable row level security;

create policy "Allow all on eggs" on eggs for all using (true) with check (true);
create policy "Allow all on games" on games for all using (true) with check (true);
create policy "Allow all on session_eggs" on session_eggs for all using (true) with check (true);
create policy "Allow all on player_position" on player_position for all using (true) with check (true);
