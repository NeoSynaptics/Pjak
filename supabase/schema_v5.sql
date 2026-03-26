-- Pjak v5: Objects + Devices + Sessions
-- Run in Supabase SQL Editor

-- Drop old tables
drop table if exists session_eggs cascade;
drop table if exists eggs cascade;
drop table if exists player_position cascade;
drop table if exists waypoints cascade;
drop table if exists games cascade;

-- Permanent objects placed by developer
create table objects (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  lat double precision not null,
  lng double precision not null,
  type text not null default 'code_object', -- '3d_model', 'text', 'code_object'
  code text not null,
  display_text text,        -- text shown on/near object
  model_ref text,           -- 3D model reference
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Devices (phones) with live GPS
create table devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null default 0,
  lng double precision not null default 0,
  updated_at timestamptz default now()
);

-- Enable realtime
alter publication supabase_realtime add table objects;
alter publication supabase_realtime add table devices;

-- RLS
alter table objects enable row level security;
alter table devices enable row level security;

create policy "Allow all on objects" on objects for all using (true) with check (true);
create policy "Allow all on devices" on devices for all using (true) with check (true);
