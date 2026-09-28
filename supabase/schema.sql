-- Aviation Word Hunt — jalankan dalam Supabase > SQL Editor

create table if not exists public.settings (
  id            int primary key default 1 check (id = 1),
  title         text not null default 'Aviation Word Hunt',
  subtitle      text not null default 'Cari perkataan & dapatkan cop passport anda!',
  grid_size     int  not null default 12 check (grid_size between 8 and 15),
  words_on_grid int  not null default 10 check (words_on_grid between 5 and 15),
  difficulty    text not null default 'sederhana' check (difficulty in ('mudah','sederhana','sukar')),
  reset_seconds int  not null default 8 check (reset_seconds between 3 and 60),
  updated_at    timestamptz not null default now()
);

create table if not exists public.words (
  id         uuid primary key default gen_random_uuid(),
  word       text not null unique check (word ~ '^[A-Z]{3,15}$'),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Had 100 perkataan
create or replace function public.limit_words() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.words) >= 100 then
    raise exception 'Had maksimum 100 perkataan';
  end if;
  return new;
end $$;

drop trigger if exists words_limit on public.words;
create trigger words_limit before insert on public.words
  for each row execute function public.limit_words();

-- RLS: semua orang boleh BACA, hanya admin (login) boleh ubah
alter table public.settings enable row level security;
alter table public.words    enable row level security;

drop policy if exists "public read settings" on public.settings;
drop policy if exists "admin write settings" on public.settings;
drop policy if exists "public read words"    on public.words;
drop policy if exists "admin write words"    on public.words;

create policy "public read settings" on public.settings for select using (true);
create policy "admin write settings" on public.settings for all to authenticated using (true) with check (true);
create policy "public read words"    on public.words    for select using (true);
create policy "admin write words"    on public.words    for all to authenticated using (true) with check (true);

-- Data permulaan
insert into public.settings (id) values (1) on conflict (id) do nothing;

insert into public.words (word) values
  ('TURBINE'),('RUDDER'),('AILERON'),('FUSELAGE'),('COCKPIT'),('PROPELLER'),('HANGAR'),
  ('RUNWAY'),('ALTITUDE'),('AIRFOIL'),('NACELLE'),('ELEVATOR'),('FLAPS'),('THRUST'),
  ('COMPRESSOR'),('NOZZLE'),('BLADE'),('ROTOR'),('AVIONICS'),('ENGINE'),('COMBUSTOR'),
  ('BORESCOPE'),('PILOT'),('RADAR'),('TAXIWAY'),('SATELLITE'),('ROCKET'),('ORBIT'),
  ('GLIDER'),('HELICOPTER'),('WINGLET'),('CARGO')
on conflict (word) do nothing;
