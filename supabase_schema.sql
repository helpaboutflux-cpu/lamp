-- ============================================================================
-- Lamp v1.0 — Supabase 관계형 스키마
--
-- Lamp의 실시간 저장은 Cloudflare Workers KV가 담당합니다(사이트 파일, 버전,
-- 방문 집계, 폼 제출). 이 스키마는 같은 데이터를 SQL로 조회·내보내기·확장하기
-- 위한 관계형 계층입니다. Supabase SQL Editor에서 한 번 실행하면 됩니다.
--
--   psql /* 또는 Dashboard → SQL Editor → 붙여넣고 Run */
--
-- 로그인은 Supabase Auth를 그대로 사용합니다(auth.users).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- 프로필
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  plan         text not null default 'free',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- 사이트
create table if not exists public.sites (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name          text not null,
  is_private    boolean not null default false,
  custom_domain text,
  current_version integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists sites_owner_idx on public.sites (owner_id);

-- ---------------------------------------------------------------- 버전
create table if not exists public.site_versions (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  version     integer not null,
  message     text,
  file_count  integer not null default 0,
  bytes       bigint not null default 0,
  is_preview  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (site_id, version)
);
create index if not exists site_versions_site_idx on public.site_versions (site_id, version desc);

-- ---------------------------------------------------------------- 방문 집계
create table if not exists public.pageviews (
  site_id  uuid not null references public.sites (id) on delete cascade,
  day      date not null,
  hour     smallint not null check (hour between 0 and 23),
  views    integer not null default 0,
  primary key (site_id, day, hour)
);
create index if not exists pageviews_day_idx on public.pageviews (day);

-- ---------------------------------------------------------------- 폼
create table if not exists public.forms (
  id         text primary key,
  site_id    uuid not null references public.sites (id) on delete cascade,
  name       text not null,
  fields     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.form_submissions (
  id         bigserial primary key,
  form_id    text not null references public.forms (id) on delete cascade,
  site_id    uuid references public.sites (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  user_agent text,
  country    char(2),
  created_at timestamptz not null default now()
);
create index if not exists submissions_form_idx on public.form_submissions (form_id, created_at desc);

-- ---------------------------------------------------------------- API 키
create table if not exists public.api_keys (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  label      text not null default '기본 키',
  key_hash   text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists api_keys_user_idx on public.api_keys (user_id);

-- ---------------------------------------------------------------- A/B 변형
create table if not exists public.ab_variants (
  site_id  uuid not null references public.sites (id) on delete cascade,
  name     text not null,
  version  integer not null,
  weight   smallint not null default 50 check (weight between 0 and 100),
  active   boolean not null default true,
  primary key (site_id, name)
);

-- ============================================================================
-- RLS (행 수준 보안): 소유자만 자기 데이터를 읽고 쓴다
-- ============================================================================
alter table public.profiles         enable row level security;
alter table public.sites            enable row level security;
alter table public.site_versions    enable row level security;
alter table public.pageviews        enable row level security;
alter table public.forms            enable row level security;
alter table public.form_submissions enable row level security;
alter table public.api_keys         enable row level security;
alter table public.ab_variants      enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists sites_owner on public.sites;
create policy sites_owner on public.sites
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists versions_owner on public.site_versions;
create policy versions_owner on public.site_versions
  for all using (exists (select 1 from public.sites s where s.id = site_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.sites s where s.id = site_id and s.owner_id = auth.uid()));

drop policy if exists pageviews_owner on public.pageviews;
create policy pageviews_owner on public.pageviews
  for select using (exists (select 1 from public.sites s where s.id = site_id and s.owner_id = auth.uid()));

drop policy if exists forms_owner on public.forms;
create policy forms_owner on public.forms
  for all using (exists (select 1 from public.sites s where s.id = site_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.sites s where s.id = site_id and s.owner_id = auth.uid()));

drop policy if exists submissions_owner on public.form_submissions;
create policy submissions_owner on public.form_submissions
  for select using (exists (select 1 from public.sites s where s.id = site_id and s.owner_id = auth.uid()));

drop policy if exists api_keys_owner on public.api_keys;
create policy api_keys_owner on public.api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists ab_owner on public.ab_variants;
create policy ab_owner on public.ab_variants
  for all using (exists (select 1 from public.sites s where s.id = site_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.sites s where s.id = site_id and s.owner_id = auth.uid()));

-- ============================================================================
-- 트리거: 가입 시 프로필 자동 생성, 수정 시각 갱신
-- ============================================================================
create or replace function public.lamp_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'user_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists lamp_on_auth_user_created on auth.users;
create trigger lamp_on_auth_user_created
  after insert on auth.users
  for each row execute function public.lamp_handle_new_user();

create or replace function public.lamp_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sites_touch on public.sites;
create trigger sites_touch before update on public.sites
  for each row execute function public.lamp_touch();

-- ============================================================================
-- 조회용 뷰: 사이트 현황
-- ============================================================================
create or replace view public.lamp_site_overview as
select
  s.slug,
  s.name,
  s.owner_id,
  s.is_private,
  s.current_version,
  s.updated_at,
  coalesce(sum(p.views) filter (where p.day >= current_date - 6), 0) as views_7d
from public.sites s
left join public.pageviews p on p.site_id = s.id
group by s.id;

-- ============================================================================
-- (선택) 무료 한도 강제: 계정당 10개 사이트
-- ============================================================================
create or replace function public.lamp_enforce_site_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.sites where owner_id = new.owner_id) >= 10 then
    raise exception 'Lamp 무료 한도: 계정당 사이트는 10개까지입니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists sites_limit on public.sites;
create trigger sites_limit before insert on public.sites
  for each row execute function public.lamp_enforce_site_limit();
