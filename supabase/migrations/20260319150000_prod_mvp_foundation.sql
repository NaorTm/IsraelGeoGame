create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  avatar_url text,
  username citext unique,
  preferred_language text not null default 'he',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.districts (
  id text primary key,
  name_he text not null,
  name_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.settlements_catalog (
  id text primary key,
  district_id text not null references public.districts (id) on delete restrict,
  region_id text not null,
  name_he text not null,
  name_en text not null,
  lat double precision not null,
  lng double precision not null,
  playable boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_district_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  district_id text not null references public.districts (id) on delete cascade,
  games_played integer not null default 0,
  best_score integer not null default 0,
  best_streak integer not null default 0,
  total_rounds integer not null default 0,
  successful_rounds integer not null default 0,
  total_misses integer not null default 0,
  accuracy_pct numeric(5, 2) not null default 0,
  last_played_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, district_id)
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type in ('solo', 'pvp')),
  mode text not null,
  district_id text not null references public.districts (id) on delete restrict,
  ruleset_version text not null,
  seed text not null,
  status text not null check (status in ('pending', 'active', 'completed', 'cancelled', 'abandoned')),
  question_count integer not null default 0,
  winner_user_id uuid references public.profiles (id) on delete set null,
  created_by_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seat smallint not null check (seat between 1 and 2),
  display_name text not null default '',
  username text,
  avatar_url text,
  joined_at timestamptz not null default timezone('utc', now()),
  ready_at timestamptz,
  finished_at timestamptz,
  final_score integer not null default 0,
  total_misses integer not null default 0,
  successful_rounds integer not null default 0,
  accuracy_pct numeric(5, 2) not null default 0,
  completion_ms integer,
  result text not null default 'pending' check (result in ('pending', 'win', 'loss', 'draw', 'completed', 'abandoned')),
  current_round_number integer not null default 1,
  last_seen_at timestamptz not null default timezone('utc', now()),
  unique (session_id, user_id),
  unique (session_id, seat)
);

create table if not exists public.session_rounds (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  round_number integer not null check (round_number > 0),
  settlement_id text not null references public.settlements_catalog (id) on delete restrict,
  primary key (session_id, round_number),
  unique (session_id, settlement_id)
);

create table if not exists public.player_round_results (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  round_number integer not null check (round_number > 0),
  attempts integer not null default 0 check (attempts >= 0),
  misses integer not null default 0 check (misses >= 0),
  score integer not null default 0 check (score >= 0),
  timed_out boolean not null default false,
  correct_settlement_id text not null references public.settlements_catalog (id) on delete restrict,
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, user_id, round_number)
);

create table if not exists public.session_answer_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  round_number integer not null check (round_number > 0),
  attempt_number integer not null check (attempt_number > 0),
  selected_settlement_id text not null references public.settlements_catalog (id) on delete restrict,
  is_correct boolean not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.matchmaking_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  district_id text not null references public.districts (id) on delete cascade,
  ruleset_version text not null,
  status text not null default 'searching' check (status in ('searching', 'matched', 'cancelled')),
  matched_session_id uuid references public.game_sessions (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists matchmaking_queue_searching_user_idx
on public.matchmaking_queue (user_id)
where status = 'searching';

create index if not exists matchmaking_queue_search_idx
on public.matchmaking_queue (district_id, ruleset_version, created_at)
where status = 'searching';

create index if not exists session_players_lookup_idx
on public.session_players (user_id, session_id);

create index if not exists session_answers_lookup_idx
on public.session_answer_events (session_id, user_id, round_number);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_district_progress_set_updated_at on public.user_district_progress;
create trigger user_district_progress_set_updated_at
before update on public.user_district_progress
for each row execute function public.set_updated_at();

drop trigger if exists matchmaking_queue_set_updated_at on public.matchmaking_queue;
create trigger matchmaking_queue_set_updated_at
before update on public.matchmaking_queue
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, preferred_language)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1),
      'שחקן חדש'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    'he'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.upsert_user_district_progress(
  p_user_id uuid,
  p_district_id text,
  p_final_score integer,
  p_best_streak integer,
  p_total_rounds integer,
  p_total_misses integer,
  p_successful_rounds integer,
  p_played_at timestamptz default timezone('utc', now())
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_district_progress (
    user_id,
    district_id,
    games_played,
    best_score,
    best_streak,
    total_rounds,
    successful_rounds,
    total_misses,
    accuracy_pct,
    last_played_at
  )
  values (
    p_user_id,
    p_district_id,
    1,
    greatest(0, p_final_score),
    greatest(0, p_best_streak),
    greatest(0, p_total_rounds),
    greatest(0, p_successful_rounds),
    greatest(0, p_total_misses),
    case
      when greatest(0, p_total_rounds) = 0 then 0
      else round((greatest(0, p_successful_rounds)::numeric / greatest(1, p_total_rounds)::numeric) * 100, 2)
    end,
    p_played_at
  )
  on conflict (user_id, district_id) do update
    set games_played = public.user_district_progress.games_played + 1,
        best_score = greatest(public.user_district_progress.best_score, excluded.best_score),
        best_streak = greatest(public.user_district_progress.best_streak, excluded.best_streak),
        total_rounds = public.user_district_progress.total_rounds + excluded.total_rounds,
        successful_rounds = public.user_district_progress.successful_rounds + excluded.successful_rounds,
        total_misses = public.user_district_progress.total_misses + excluded.total_misses,
        accuracy_pct = case
          when (public.user_district_progress.total_rounds + excluded.total_rounds) = 0 then 0
          else round(
            ((public.user_district_progress.successful_rounds + excluded.successful_rounds)::numeric /
            (public.user_district_progress.total_rounds + excluded.total_rounds)::numeric) * 100,
            2
          )
        end,
        last_played_at = excluded.last_played_at,
        updated_at = timezone('utc', now());
end;
$$;

create or replace function public.create_pvp_session(
  p_user_a uuid,
  p_user_b uuid,
  p_district_id text,
  p_ruleset_version text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid := gen_random_uuid();
  v_seed text := gen_random_uuid()::text;
  v_question_count integer;
begin
  select least(10, count(*))
    into v_question_count
  from public.settlements_catalog
  where district_id = p_district_id
    and playable = true;

  if coalesce(v_question_count, 0) < 1 then
    raise exception 'No playable settlements found for district %', p_district_id;
  end if;

  insert into public.game_sessions (
    id,
    session_type,
    mode,
    district_id,
    ruleset_version,
    seed,
    status,
    question_count,
    created_by_user_id
  )
  values (
    v_session_id,
    'pvp',
    'pvp_duel',
    p_district_id,
    p_ruleset_version,
    v_seed,
    'pending',
    v_question_count,
    p_user_a
  );

  insert into public.session_players (session_id, user_id, seat, display_name, username, avatar_url)
  select v_session_id, p.id, 1, p.display_name, p.username::text, p.avatar_url
  from public.profiles p
  where p.id = p_user_a;

  insert into public.session_players (session_id, user_id, seat, display_name, username, avatar_url)
  select v_session_id, p.id, 2, p.display_name, p.username::text, p.avatar_url
  from public.profiles p
  where p.id = p_user_b;

  insert into public.session_rounds (session_id, round_number, settlement_id)
  select
    v_session_id,
    row_number() over (order by ranked.id),
    ranked.id
  from (
    select id
    from public.settlements_catalog
    where district_id = p_district_id
      and playable = true
    order by md5(v_seed || id)
    limit v_question_count
  ) as ranked;

  return v_session_id;
end;
$$;

create or replace function public.finalize_pvp_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first record;
  v_second record;
  v_draw boolean := false;
begin
  if exists (
    select 1
    from public.session_players
    where session_id = p_session_id
      and finished_at is null
  ) then
    return;
  end if;

  select *
    into v_first
  from public.session_players
  where session_id = p_session_id
  order by final_score desc, total_misses asc, completion_ms asc nulls last, seat asc
  limit 1;

  select *
    into v_second
  from public.session_players
  where session_id = p_session_id
  order by final_score desc, total_misses asc, completion_ms asc nulls last, seat asc
  offset 1
  limit 1;

  if v_first is null then
    return;
  end if;

  if v_second is not null
    and v_first.final_score = v_second.final_score
    and v_first.total_misses = v_second.total_misses
    and coalesce(v_first.completion_ms, 2147483647) = coalesce(v_second.completion_ms, 2147483647) then
    v_draw := true;
  end if;

  update public.session_players
  set result = case
    when v_draw then 'draw'
    when user_id = v_first.user_id then 'win'
    else 'loss'
  end
  where session_id = p_session_id;

  update public.game_sessions
  set status = 'completed',
      completed_at = timezone('utc', now()),
      winner_user_id = case when v_draw then null else v_first.user_id end
  where id = p_session_id;
end;
$$;

create or replace function public.claim_username(p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized text;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_normalized := lower(trim(coalesce(p_username, '')));

  if v_normalized !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3-20 characters using letters, numbers, or underscores';
  end if;

  update public.profiles
  set username = v_normalized,
      updated_at = timezone('utc', now())
  where id = v_user_id
  returning * into v_profile;

  return v_profile;
exception
  when unique_violation then
    raise exception 'Username already taken';
end;
$$;

create or replace function public.queue_pvp_match(
  p_district_id text,
  p_ruleset_version text default 'pvp_fixed_10_v1'
)
returns table(queue_id uuid, session_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_queue public.matchmaking_queue;
  v_opponent_queue public.matchmaking_queue;
  v_session_id uuid;
  v_queue_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_district_id || ':' || p_ruleset_version, 0));

  select *
    into v_existing_queue
  from public.matchmaking_queue as existing_queue
  where existing_queue.user_id = v_user_id
    and existing_queue.status = 'searching'
  limit 1;

  if found then
    return query
    select v_existing_queue.id, v_existing_queue.matched_session_id, v_existing_queue.status;
    return;
  end if;

  select mq.*
    into v_opponent_queue
  from public.matchmaking_queue mq
  where mq.district_id = p_district_id
    and mq.ruleset_version = p_ruleset_version
    and mq.status = 'searching'
    and mq.user_id <> v_user_id
  order by mq.created_at asc
  limit 1
  for update skip locked;

  if found then
    v_session_id := public.create_pvp_session(v_opponent_queue.user_id, v_user_id, p_district_id, p_ruleset_version);

    update public.matchmaking_queue
    set status = 'matched',
        matched_session_id = v_session_id,
        updated_at = timezone('utc', now())
    where id = v_opponent_queue.id;

    insert into public.matchmaking_queue (user_id, district_id, ruleset_version, status, matched_session_id)
    values (v_user_id, p_district_id, p_ruleset_version, 'matched', v_session_id)
    returning id into v_queue_id;

    return query
    select v_queue_id, v_session_id, 'matched'::text;
    return;
  end if;

  insert into public.matchmaking_queue (user_id, district_id, ruleset_version, status)
  values (v_user_id, p_district_id, p_ruleset_version, 'searching')
  returning id into v_queue_id;

  return query
  select v_queue_id, null::uuid, 'searching'::text;
end;
$$;

create or replace function public.cancel_matchmaking(p_queue_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.matchmaking_queue
  set status = 'cancelled',
      updated_at = timezone('utc', now())
  where matchmaking_queue.user_id = v_user_id
    and matchmaking_queue.status = 'searching'
    and (p_queue_id is null or matchmaking_queue.id = p_queue_id);

  return found;
end;
$$;

create or replace function public.set_match_ready(p_session_id uuid)
returns table(session_id uuid, status text, started_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.session_players
  set ready_at = coalesce(ready_at, timezone('utc', now())),
      last_seen_at = timezone('utc', now())
  where session_players.session_id = p_session_id
    and session_players.user_id = v_user_id;

  if not found then
    raise exception 'Match participant not found';
  end if;

  if exists (
    select 1
    from public.game_sessions as sessions
    where sessions.id = p_session_id
      and sessions.status = 'pending'
  ) and not exists (
    select 1
    from public.session_players as players
    where players.session_id = p_session_id
      and players.ready_at is null
  ) then
    update public.game_sessions
    set status = 'active',
        started_at = coalesce(game_sessions.started_at, timezone('utc', now()))
    where game_sessions.id = p_session_id
      and game_sessions.status = 'pending';
  end if;

  return query
  select gs.id, gs.status, gs.started_at
  from public.game_sessions gs
  where gs.id = p_session_id;
end;
$$;

create or replace function public.submit_pvp_guess(
  p_session_id uuid,
  p_round_number integer,
  p_selected_settlement_id text
)
returns table(
  round_complete boolean,
  is_correct boolean,
  attempts integer,
  misses integer,
  score integer,
  correct_settlement_id text,
  player_finished boolean,
  session_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.game_sessions;
  v_player public.session_players;
  v_correct_settlement_id text;
  v_attempt_number integer;
  v_is_correct boolean;
  v_score integer := 0;
  v_question_count integer;
  v_total_success integer;
  v_player_finished boolean := false;
  v_session_completed boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_session
  from public.game_sessions
  where id = p_session_id
    and session_type = 'pvp';

  if v_session is null then
    raise exception 'PvP match not found';
  end if;

  if v_session.status <> 'active' then
    raise exception 'Match is not active';
  end if;

  select *
    into v_player
  from public.session_players
  where session_id = p_session_id
    and user_id = v_user_id;

  if v_player is null then
    raise exception 'Participant not found';
  end if;

  if v_player.finished_at is not null then
    raise exception 'Player already finished';
  end if;

  if v_player.current_round_number <> p_round_number then
    raise exception 'Invalid round number';
  end if;

  if exists (
    select 1
    from public.player_round_results
    where session_id = p_session_id
      and user_id = v_user_id
      and round_number = p_round_number
  ) then
    raise exception 'Round already resolved';
  end if;

  select settlement_id
    into v_correct_settlement_id
  from public.session_rounds
  where session_id = p_session_id
    and round_number = p_round_number;

  if v_correct_settlement_id is null then
    raise exception 'Round definition not found';
  end if;

  select count(*) + 1
    into v_attempt_number
  from public.session_answer_events
  where session_id = p_session_id
    and user_id = v_user_id
    and round_number = p_round_number;

  v_is_correct := p_selected_settlement_id = v_correct_settlement_id;

  insert into public.session_answer_events (
    session_id,
    user_id,
    round_number,
    attempt_number,
    selected_settlement_id,
    is_correct
  )
  values (
    p_session_id,
    v_user_id,
    p_round_number,
    v_attempt_number,
    p_selected_settlement_id,
    v_is_correct
  );

  if not v_is_correct then
    update public.session_players
    set total_misses = total_misses + 1,
        last_seen_at = timezone('utc', now())
    where session_id = p_session_id
      and user_id = v_user_id;
  end if;

  if v_is_correct then
    v_score := greatest(0, 4 - v_attempt_number);

    insert into public.player_round_results (
      session_id,
      user_id,
      round_number,
      attempts,
      misses,
      score,
      timed_out,
      correct_settlement_id
    )
    values (
      p_session_id,
      v_user_id,
      p_round_number,
      v_attempt_number,
      greatest(0, v_attempt_number - 1),
      v_score,
      false,
      v_correct_settlement_id
    );

    update public.session_players
    set final_score = final_score + v_score,
        successful_rounds = successful_rounds + 1,
        current_round_number = current_round_number + 1,
        last_seen_at = timezone('utc', now())
    where session_id = p_session_id
      and user_id = v_user_id;
  elsif v_attempt_number >= 3 then
    insert into public.player_round_results (
      session_id,
      user_id,
      round_number,
      attempts,
      misses,
      score,
      timed_out,
      correct_settlement_id
    )
    values (
      p_session_id,
      v_user_id,
      p_round_number,
      3,
      3,
      0,
      false,
      v_correct_settlement_id
    );

    update public.session_players
    set current_round_number = current_round_number + 1,
        last_seen_at = timezone('utc', now())
    where session_id = p_session_id
      and user_id = v_user_id;
  else
    return query
    select false, v_is_correct, v_attempt_number, v_attempt_number, 0, v_correct_settlement_id, false, false;
    return;
  end if;

  v_question_count := v_session.question_count;

  if p_round_number >= v_question_count then
    select successful_rounds
      into v_total_success
    from public.session_players
    where session_id = p_session_id
      and user_id = v_user_id;

    update public.session_players
    set finished_at = coalesce(finished_at, timezone('utc', now())),
        completion_ms = greatest(
          0,
          floor(extract(epoch from (timezone('utc', now()) - v_session.started_at)) * 1000)::integer
        ),
        accuracy_pct = case
          when v_question_count = 0 then 0
          else round((coalesce(v_total_success, 0)::numeric / v_question_count::numeric) * 100, 2)
        end,
        result = 'pending'
    where session_id = p_session_id
      and user_id = v_user_id;

    v_player_finished := true;
  end if;

  perform public.finalize_pvp_session(p_session_id);

  select exists (
    select 1
    from public.game_sessions
    where id = p_session_id
      and status = 'completed'
  )
  into v_session_completed;

  return query
  select true, v_is_correct, v_attempt_number, case when v_is_correct then greatest(0, v_attempt_number - 1) else 3 end, v_score, v_correct_settlement_id, v_player_finished, v_session_completed;
end;
$$;

create or replace function public.submit_pvp_timeout(
  p_session_id uuid,
  p_round_number integer
)
returns table(
  round_complete boolean,
  attempts integer,
  misses integer,
  correct_settlement_id text,
  player_finished boolean,
  session_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.game_sessions;
  v_player public.session_players;
  v_attempt_count integer;
  v_correct_settlement_id text;
  v_total_success integer;
  v_player_finished boolean := false;
  v_session_completed boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_session
  from public.game_sessions
  where id = p_session_id
    and session_type = 'pvp';

  if v_session is null or v_session.status <> 'active' then
    raise exception 'Match is not active';
  end if;

  select *
    into v_player
  from public.session_players
  where session_id = p_session_id
    and user_id = v_user_id;

  if v_player is null or v_player.current_round_number <> p_round_number then
    raise exception 'Invalid round number';
  end if;

  if exists (
    select 1
    from public.player_round_results
    where session_id = p_session_id
      and user_id = v_user_id
      and round_number = p_round_number
  ) then
    raise exception 'Round already resolved';
  end if;

  select settlement_id
    into v_correct_settlement_id
  from public.session_rounds
  where session_id = p_session_id
    and round_number = p_round_number;

  select count(*)
    into v_attempt_count
  from public.session_answer_events
  where session_id = p_session_id
    and user_id = v_user_id
    and round_number = p_round_number;

  insert into public.player_round_results (
    session_id,
    user_id,
    round_number,
    attempts,
    misses,
    score,
    timed_out,
    correct_settlement_id
  )
  values (
    p_session_id,
    v_user_id,
    p_round_number,
    v_attempt_count,
    v_attempt_count,
    0,
    true,
    v_correct_settlement_id
  );

  update public.session_players
  set current_round_number = current_round_number + 1,
      last_seen_at = timezone('utc', now())
  where session_id = p_session_id
    and user_id = v_user_id;

  if p_round_number >= v_session.question_count then
    select successful_rounds
      into v_total_success
    from public.session_players
    where session_id = p_session_id
      and user_id = v_user_id;

    update public.session_players
    set finished_at = coalesce(finished_at, timezone('utc', now())),
        completion_ms = greatest(
          0,
          floor(extract(epoch from (timezone('utc', now()) - v_session.started_at)) * 1000)::integer
        ),
        accuracy_pct = case
          when v_session.question_count = 0 then 0
          else round((coalesce(v_total_success, 0)::numeric / v_session.question_count::numeric) * 100, 2)
        end,
        result = 'pending'
    where session_id = p_session_id
      and user_id = v_user_id;

    v_player_finished := true;
  end if;

  perform public.finalize_pvp_session(p_session_id);

  select exists (
    select 1
    from public.game_sessions
    where id = p_session_id
      and status = 'completed'
  )
  into v_session_completed;

  return query
  select true, v_attempt_count, v_attempt_count, v_correct_settlement_id, v_player_finished, v_session_completed;
end;
$$;

create or replace function public.record_solo_session(
  p_district_id text,
  p_mode text,
  p_ruleset_version text,
  p_round_results jsonb,
  p_total_score integer,
  p_best_streak integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid := gen_random_uuid();
  v_round_count integer := coalesce(jsonb_array_length(p_round_results), 0);
  v_total_misses integer := 0;
  v_successful_rounds integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_round_count = 0 then
    raise exception 'Round results are required';
  end if;

  select coalesce(sum(coalesce((item ->> 'misses')::integer, 0)), 0),
         coalesce(sum(case when coalesce((item ->> 'score')::integer, 0) > 0 then 1 else 0 end), 0)
    into v_total_misses, v_successful_rounds
  from jsonb_array_elements(p_round_results) as item;

  insert into public.game_sessions (
    id,
    session_type,
    mode,
    district_id,
    ruleset_version,
    seed,
    status,
    question_count,
    winner_user_id,
    created_by_user_id,
    started_at,
    completed_at
  )
  values (
    v_session_id,
    'solo',
    p_mode,
    p_district_id,
    p_ruleset_version,
    gen_random_uuid()::text,
    'completed',
    v_round_count,
    v_user_id,
    v_user_id,
    timezone('utc', now()),
    timezone('utc', now())
  );

  insert into public.session_players (
    session_id,
    user_id,
    seat,
    display_name,
    username,
    avatar_url,
    ready_at,
    finished_at,
    final_score,
    total_misses,
    successful_rounds,
    accuracy_pct,
    completion_ms,
    result,
    current_round_number,
    last_seen_at
  )
  select
    v_session_id,
    p.id,
    1,
    p.display_name,
    p.username::text,
    p.avatar_url,
    timezone('utc', now()),
    timezone('utc', now()),
    greatest(0, p_total_score),
    v_total_misses,
    v_successful_rounds,
    case
      when v_round_count = 0 then 0
      else round((v_successful_rounds::numeric / v_round_count::numeric) * 100, 2)
    end,
    null,
    'completed',
    v_round_count + 1,
    timezone('utc', now())
  from public.profiles p
  where p.id = v_user_id;

  insert into public.session_rounds (session_id, round_number, settlement_id)
  select
    v_session_id,
    row_number() over (),
    item ->> 'settlement_id'
  from jsonb_array_elements(p_round_results) as item;

  insert into public.player_round_results (
    session_id,
    user_id,
    round_number,
    attempts,
    misses,
    score,
    timed_out,
    correct_settlement_id
  )
  select
    v_session_id,
    v_user_id,
    coalesce((item ->> 'round_number')::integer, row_number() over ()),
    coalesce((item ->> 'attempts')::integer, 0),
    coalesce((item ->> 'misses')::integer, 0),
    coalesce((item ->> 'score')::integer, 0),
    coalesce((item ->> 'timed_out')::boolean, false),
    item ->> 'settlement_id'
  from jsonb_array_elements(p_round_results) as item;

  perform public.upsert_user_district_progress(
    v_user_id,
    p_district_id,
    p_total_score,
    p_best_streak,
    v_round_count,
    v_total_misses,
    v_successful_rounds,
    timezone('utc', now())
  );

  return v_session_id;
end;
$$;

create or replace function public.is_session_participant(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.session_players sp
    where sp.session_id = p_session_id
      and sp.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_district_progress enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.session_rounds enable row level security;
alter table public.player_round_results enable row level security;
alter table public.session_answer_events enable row level security;
alter table public.matchmaking_queue enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "progress_select_self" on public.user_district_progress;
create policy "progress_select_self"
on public.user_district_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "queue_select_self" on public.matchmaking_queue;
create policy "queue_select_self"
on public.matchmaking_queue
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "sessions_select_participant" on public.game_sessions;
create policy "sessions_select_participant"
on public.game_sessions
for select
to authenticated
using (
  public.is_session_participant(game_sessions.id)
);

drop policy if exists "session_players_select_participant" on public.session_players;
create policy "session_players_select_participant"
on public.session_players
for select
to authenticated
using (
  public.is_session_participant(session_players.session_id)
);

drop policy if exists "session_rounds_select_participant" on public.session_rounds;
create policy "session_rounds_select_participant"
on public.session_rounds
for select
to authenticated
using (
  public.is_session_participant(session_rounds.session_id)
);

drop policy if exists "player_round_results_select_participant" on public.player_round_results;
create policy "player_round_results_select_participant"
on public.player_round_results
for select
to authenticated
using (
  public.is_session_participant(player_round_results.session_id)
);

drop policy if exists "session_answer_events_select_participant" on public.session_answer_events;
create policy "session_answer_events_select_participant"
on public.session_answer_events
for select
to authenticated
using (
  public.is_session_participant(session_answer_events.session_id)
);

grant execute on function public.is_session_participant(uuid) to authenticated;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.queue_pvp_match(text, text) to authenticated;
grant execute on function public.cancel_matchmaking(uuid) to authenticated;
grant execute on function public.set_match_ready(uuid) to authenticated;
grant execute on function public.submit_pvp_guess(uuid, integer, text) to authenticated;
grant execute on function public.submit_pvp_timeout(uuid, integer) to authenticated;
grant execute on function public.record_solo_session(text, text, text, jsonb, integer, integer) to authenticated;
