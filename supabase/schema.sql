-- Pjak: Påsk Ägg Jakt Game
-- Run this in Supabase SQL Editor to set up the database

-- Game sessions
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Påskjakt',
  current_waypoint_index int not null default 0,
  status text not null default 'waiting', -- waiting, active, finished
  created_at timestamptz default now()
);

-- Waypoints (egg locations)
create table if not exists waypoints (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  idx int not null, -- order in the hunt
  label text not null, -- e.g. "Storgatan 5"
  lat double precision not null,
  lng double precision not null,
  code text not null, -- the secret code shown on the egg
  collected boolean not null default false,
  created_at timestamptz default now()
);

-- Player position (updated by phone, one row per game)
create table if not exists player_position (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade unique,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz default now()
);

-- Enable realtime on all tables
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table waypoints;
alter publication supabase_realtime add table player_position;

-- RLS policies (permissive for now)
alter table games enable row level security;
alter table waypoints enable row level security;
alter table player_position enable row level security;

create policy "Allow all on games" on games for all using (true) with check (true);
create policy "Allow all on waypoints" on waypoints for all using (true) with check (true);
create policy "Allow all on player_position" on player_position for all using (true) with check (true);
