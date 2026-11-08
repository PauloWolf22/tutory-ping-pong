-- Tutory Sports: contas, modalidades, resultados e ranking.
--
-- COMO USAR: rode DEPOIS do schema.sql, que já está no banco.
-- Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- Pode rodar de novo com segurança: os dados são mantidos.
--
-- Modelo de segurança:
-- - Contas usam o Supabase Auth (e-mail e senha). Qualquer um se cadastra, mas a conta
--   só participa depois que o administrador aprova.
-- - O administrador continua sendo a senha do schema.sql (token de sessão em private.sessions).
-- - O site lê só o que é público: perfis aprovados, modalidades, resultados aprovados e ranking.
--   O e-mail nunca sai do banco, exceto para o administrador na lista de aprovação.
-- - Toda gravação passa por funções sp_*, que conferem quem está chamando.

-- ---------------------------------------------------------------- tabelas
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (length(name) between 2 and 60),
  nick text check (nick is null or length(nick) <= 30),
  gender text not null check (gender in ('m', 'f')),
  belt text check (belt is null or length(belt) <= 20),
  avatar jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.modalities (
  id text primary key,
  name text not null,
  family text not null check (family in ('esporte', 'gaming')),
  kind text not null default 'individual' check (kind in ('individual', 'equipe')),
  score_hint text,
  methods text[],
  active boolean not null default true,
  sort int not null default 0
);

insert into public.modalities (id, name, family, kind, score_hint, methods, sort) values
  ('pingpong', 'Ping Pong', 'esporte', 'individual', 'Games, ex.: 2 x 1', null, 1),
  ('jiujitsu', 'Jiu-Jitsu', 'esporte', 'individual', 'Pontos, ex.: 4 x 2', array['Finalização', 'Pontos', 'Vantagem', 'Decisão', 'Desclassificação'], 2),
  ('eafc', 'EA FC', 'gaming', 'individual', 'Gols, ex.: 3 x 1', null, 3),
  ('cod', 'Call of Duty', 'gaming', 'individual', 'Abates ou rodadas', null, 4),
  ('mk', 'Mortal Kombat', 'gaming', 'individual', 'Rounds, ex.: 2 x 0', null, 5)
on conflict (id) do nothing;

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  modality text not null references public.modalities (id),
  kind text not null default 'amistoso' check (kind in ('amistoso', 'campeonato')),
  p1 uuid not null references public.profiles (id) on delete cascade,
  p2 uuid not null references public.profiles (id) on delete cascade,
  winner uuid not null references public.profiles (id) on delete cascade,
  score text check (score is null or length(score) <= 40),
  method text check (method is null or length(method) <= 40),
  note text check (note is null or length(note) <= 200),
  source text unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reported_by uuid references public.profiles (id) on delete set null,
  played_on date not null default current_date,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (p1 <> p2),
  check (winner in (p1, p2))
);
create index if not exists results_modality_status on public.results (modality, status);

create table if not exists public.awards (
  id uuid primary key default gen_random_uuid(),
  modality text not null references public.modalities (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null check (place in ('campeao', 'vice')),
  label text not null check (length(label) <= 80),
  source text unique,
  created_at timestamptz not null default now()
);

-- Pontuação do ranking, editável aqui sem mexer no app.
create table if not exists public.ranking_rules (
  id int primary key default 1 check (id = 1),
  win int not null default 3,
  loss int not null default 1,
  champion int not null default 10,
  vice int not null default 5
);
insert into public.ranking_rules (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- rankings por modalidade (fase 3)
-- Pontuação por modalidade. A linha '*' vale para toda modalidade sem linha própria.
-- weight: peso da modalidade no ranking geral consolidado (que usa pontos normalizados, 0 a 100 por modalidade).
create table if not exists public.ranking_points (
  modality text primary key,
  win int not null default 3 check (win between 0 and 1000),
  loss int not null default 1 check (loss between 0 and 1000),
  friendly_win int not null default 2 check (friendly_win between 0 and 1000),
  friendly_loss int not null default 1 check (friendly_loss between 0 and 1000),
  participation int not null default 1 check (participation between 0 and 1000),
  champion int not null default 10 check (champion between 0 and 1000),
  vice int not null default 5 check (vice between 0 and 1000),
  third int not null default 3 check (third between 0 and 1000),
  achievement int not null default 2 check (achievement between 0 and 1000),
  weight numeric(4, 2) not null default 1 check (weight between 0 and 10),
  updated_at timestamptz not null default now()
);
-- primeira vez: herda a pontuação que já estava em ranking_rules
insert into public.ranking_points (modality, win, loss, friendly_win, friendly_loss, champion, vice)
select '*', win, loss, win, loss, champion, vice from public.ranking_rules where id = 1
on conflict (modality) do nothing;

-- Faixa do jiu-jitsu: a pessoa informa, o administrador valida. Só faixa validada entra no ranking por faixa.
alter table public.profiles add column if not exists belt_verified boolean not null default false;

-- Categoria do campeonato de origem (m, f ou misto) e equipes (Counter-Strike e outras modalidades por equipe).
alter table public.results add column if not exists category text check (category is null or category in ('m', 'f', 'misto'));
alter table public.results add column if not exists team1 uuid[];
alter table public.results add column if not exists team2 uuid[];
alter table public.awards add column if not exists category text check (category is null or category in ('m', 'f', 'misto'));
alter table public.awards drop constraint if exists awards_place_check;
alter table public.awards add constraint awards_place_check check (place in ('campeao', 'vice', 'terceiro', 'participacao', 'conquista'));
alter table public.modalities drop constraint if exists modalities_family_check;
alter table public.modalities add constraint modalities_family_check check (family in ('esporte', 'gaming', 'esports'));

insert into public.modalities (id, name, family, kind, score_hint, methods, sort) values
  ('cs', 'Counter-Strike', 'esports', 'equipe', 'Rounds, ex.: 13 x 9', null, 6)
on conflict (id) do nothing;

-- Registro de auditoria: toda alteração em resultados, títulos, pontuação, modalidades e status/faixa de contas.
create table if not exists private.audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  tbl text not null,
  op text not null,
  row_id text,
  before jsonb,
  after jsonb
);
create index if not exists audit_at on private.audit (at desc);

-- Aviso leve para as telas recarregarem (mesmo padrão do tournament_signal).
create table if not exists public.sports_signal (
  id int primary key default 1 check (id = 1),
  rev bigint not null default 0
);
insert into public.sports_signal (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- acesso direto: só leitura do que é público
alter table public.profiles enable row level security;
alter table public.modalities enable row level security;
alter table public.results enable row level security;
alter table public.awards enable row level security;
alter table public.ranking_rules enable row level security;
alter table public.ranking_points enable row level security;
alter table public.sports_signal enable row level security;

drop policy if exists "aprovados ou o proprio" on public.profiles;
create policy "aprovados ou o proprio" on public.profiles for select to anon, authenticated
  using (status = 'approved' or id = (select auth.uid()));
drop policy if exists "leitura publica" on public.modalities;
create policy "leitura publica" on public.modalities for select to anon, authenticated using (true);
drop policy if exists "aprovados ou envolvidos" on public.results;
create policy "aprovados ou envolvidos" on public.results for select to anon, authenticated
  using (status = 'approved' or (select auth.uid()) in (p1, p2));
drop policy if exists "leitura publica" on public.awards;
create policy "leitura publica" on public.awards for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.ranking_rules;
create policy "leitura publica" on public.ranking_rules for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.ranking_points;
create policy "leitura publica" on public.ranking_points for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.sports_signal;
create policy "leitura publica" on public.sports_signal for select to anon, authenticated using (true);

revoke insert, update, delete on public.profiles, public.modalities, public.results, public.awards,
  public.ranking_rules, public.ranking_points, public.sports_signal from anon, authenticated;
grant select on public.profiles, public.modalities, public.results, public.awards,
  public.ranking_rules, public.ranking_points, public.sports_signal to anon, authenticated;
revoke all on private.audit from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sports_signal'
  ) then
    alter publication supabase_realtime add table public.sports_signal;
  end if;
end $$;

-- ---------------------------------------------------------------- auxiliares
create or replace function private.sports_bump() returns void
language sql set search_path = '' as $$
  update public.sports_signal set rev = rev + 1 where id = 1;
$$;

create or replace function private.approved(p_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_id and status = 'approved');
$$;

create or replace function private.clean(p text, p_max int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), p_max), '');
$$;

-- Faixas aceitas (adulto e infantil). Só faixa validada pelo administrador vale no ranking por faixa.
create or replace function private.valid_belt(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or p in ('Branca', 'Cinza', 'Amarela', 'Laranja', 'Verde', 'Azul', 'Roxa', 'Marrom', 'Preta');
$$;

-- Auditoria por gatilho: pega qualquer caminho de alteração, não só as funções sp_*.
-- Quem: a conta logada (auth.uid) ou, nas funções do painel, o administrador.
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_after jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if tg_table_name = 'profiles' then
    -- avatar e apelido mudam o tempo todo e não interessam à auditoria
    v_before := v_before - 'avatar';
    v_after := v_after - 'avatar';
    if tg_op = 'UPDATE' and (v_before - 'nick') = (v_after - 'nick') then return null; end if;
  end if;
  insert into private.audit (actor, tbl, op, row_id, before, after)
  values (coalesce(nullif(current_setting('app.actor', true), ''), (select auth.uid())::text, 'administrador'), tg_table_name, lower(tg_op),
    coalesce(v_after ->> 'id', v_before ->> 'id', v_after ->> 'modality', v_before ->> 'modality'), v_before, v_after);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['results', 'awards', 'ranking_points', 'modalities', 'profiles'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function private.audit_row()', t);
  end loop;
end $$;

-- Pontuação de uma modalidade: a linha própria ou, sem ela, a linha '*'.
create or replace function private.points_for(p_modality text) returns public.ranking_points
language sql stable set search_path = '' as $$
  select * from public.ranking_points where modality in (p_modality, '*') order by modality = p_modality desc limit 1;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- conta do participante
-- Cria ou atualiza o próprio perfil. Conta nova entra como "aguardando aprovação".
create or replace function public.sp_save_profile(p_name text, p_nick text, p_gender text, p_belt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := private.clean(p_name, 60);
begin
  if v_uid is null then return jsonb_build_object('error', 'Entre na sua conta.'); end if;
  if v_name is null or length(v_name) < 2 then return jsonb_build_object('error', 'Informe seu nome.'); end if;
  if p_gender not in ('m', 'f') then return jsonb_build_object('error', 'Escolha a categoria: masculino ou feminino.'); end if;
  if not private.valid_belt(private.clean(p_belt, 20)) then return jsonb_build_object('error', 'Faixa inválida.'); end if;
  -- trocar a faixa tira a validação: o administrador confere de novo
  insert into public.profiles as p (id, name, nick, gender, belt)
  values (v_uid, v_name, private.clean(p_nick, 30), p_gender, private.clean(p_belt, 20))
  on conflict (id) do update set name = excluded.name, nick = excluded.nick, gender = excluded.gender, belt = excluded.belt,
    belt_verified = case when p.belt is distinct from excluded.belt then false else p.belt_verified end;
  perform private.sports_bump();
  return (select to_jsonb(p) from public.profiles p where p.id = v_uid);
end $$;

create or replace function public.sp_save_my_avatar(p_avatar jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return jsonb_build_object('error', 'Entre na sua conta.'); end if;
  if jsonb_typeof(p_avatar) is distinct from 'object' or octet_length(p_avatar::text) > 30000 then
    return jsonb_build_object('error', 'Dados do avatar inválidos.');
  end if;
  update public.profiles set avatar = p_avatar where id = auth.uid();
  if not found then return jsonb_build_object('error', 'Complete seu perfil antes do avatar.'); end if;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

-- Amistoso: quem jogou informa; o administrador aprova antes de contar no ranking.
-- Modalidade por equipe (ex.: Counter-Strike): p_team são os colegas de quem lança, p_opponents a equipe adversária
-- (o primeiro é p_opponent). Cada integrante ganha ou perde o jogo no ranking.
drop function if exists public.sp_report_result(text, uuid, boolean, text, text, date);
create or replace function public.sp_report_result(p_modality text, p_opponent uuid, p_won boolean, p_score text, p_method text, p_played_on date,
  p_team uuid[] default null, p_opponents uuid[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_kind text;
  v_day date := coalesce(p_played_on, current_date);
  v_t1 uuid[];
  v_t2 uuid[];
  v_score text := private.clean(p_score, 40);
begin
  if v_uid is null then return jsonb_build_object('error', 'Entre na sua conta.'); end if;
  if not private.approved(v_uid) then return jsonb_build_object('error', 'Sua conta ainda aguarda aprovação do administrador.'); end if;
  if not private.approved(p_opponent) or p_opponent = v_uid then return jsonb_build_object('error', 'Escolha um adversário com conta aprovada.'); end if;
  select kind into v_kind from public.modalities where id = p_modality and active;
  if v_kind is null then return jsonb_build_object('error', 'Modalidade inválida.'); end if;
  if p_played_on is not null and (p_played_on > current_date or p_played_on < current_date - 60) then
    return jsonb_build_object('error', 'A data do jogo precisa ser dos últimos 60 dias.');
  end if;
  if (select count(*) from public.results where reported_by = v_uid and status = 'pending') >= 20 then
    return jsonb_build_object('error', 'Você já tem 20 resultados aguardando aprovação.');
  end if;
  if v_kind = 'equipe' then
    v_t1 := array(select distinct x from unnest(array[v_uid] || coalesce(p_team, '{}')) x);
    v_t2 := array(select distinct x from unnest(array[p_opponent] || coalesce(p_opponents, '{}')) x);
    if cardinality(v_t1) > 5 or cardinality(v_t2) > 5 then return jsonb_build_object('error', 'Cada equipe tem no máximo 5 pessoas.'); end if;
    if v_t1 && v_t2 then return jsonb_build_object('error', 'A mesma pessoa não pode estar nas duas equipes.'); end if;
    if exists (select 1 from unnest(v_t1 || v_t2) x where not private.approved(x)) then
      return jsonb_build_object('error', 'Todos da equipe precisam ter conta aprovada.');
    end if;
  end if;
  -- mesmo jogo lançado duas vezes (por qualquer um dos dois lados) não entra de novo
  if exists (select 1 from public.results r where r.modality = p_modality and r.kind = 'amistoso' and r.status <> 'rejected'
      and r.played_on = v_day and least(r.p1, r.p2) = least(v_uid, p_opponent) and greatest(r.p1, r.p2) = greatest(v_uid, p_opponent)
      and r.score is not distinct from v_score
      and r.winner = case when p_won then v_uid else p_opponent end) then
    return jsonb_build_object('error', 'Esse resultado já foi lançado. Se foi outro jogo, informe o placar para diferenciar.');
  end if;
  insert into public.results (modality, kind, p1, p2, winner, score, method, status, reported_by, played_on, team1, team2)
  values (p_modality, 'amistoso', v_uid, p_opponent, case when p_won then v_uid else p_opponent end,
    v_score, private.clean(p_method, 40), 'pending', v_uid, v_day, v_t1, v_t2)
  returning id into v_id;
  perform private.sports_bump();
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.sp_cancel_result(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.results where id = p_id and reported_by = auth.uid() and status = 'pending';
  if not found then return jsonb_build_object('error', 'Só dá para cancelar um resultado seu ainda não aprovado.'); end if;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- ranking (público)
-- Ranking de uma modalidade. p_gender: null (geral), 'm' ou 'f' (categoria da conta).
-- p_belt: só contas com essa faixa validada pelo administrador (jiu-jitsu).
-- Pontos com a pontuação da modalidade (ou a padrão '*'). Só resultados aprovados contam.
drop function if exists public.sp_ranking(text, text);
create or replace function public.sp_ranking(p_modality text, p_gender text, p_belt text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (select * from private.points_for(p_modality)),
  res as (select * from public.results where status = 'approved' and modality = p_modality),
  games as (
    select u as uid, (res.winner = res.p1) as won, res.kind from res, unnest(coalesce(res.team1, array[res.p1])) u
    union all
    select u, (res.winner = res.p2), res.kind from res, unnest(coalesce(res.team2, array[res.p2])) u
  ),
  g as (
    select uid,
      count(*) filter (where won and kind = 'campeonato') as cwins, count(*) filter (where not won and kind = 'campeonato') as closses,
      count(*) filter (where won and kind = 'amistoso') as fwins, count(*) filter (where not won and kind = 'amistoso') as flosses
    from games group by uid
  ),
  a as (
    select user_id as uid,
      count(*) filter (where place = 'campeao') as titles, count(*) filter (where place = 'vice') as vices,
      count(*) filter (where place = 'terceiro') as thirds, count(*) filter (where place = 'participacao') as events,
      count(*) filter (where place = 'conquista') as achievements
    from public.awards where modality = p_modality group by user_id
  ),
  t as (
    select p.id, p.name, p.nick, p.gender, p.belt, p.belt_verified, p.avatar ->> 'thumb' as thumb,
      coalesce(g.cwins, 0) + coalesce(g.fwins, 0) as wins, coalesce(g.closses, 0) + coalesce(g.flosses, 0) as losses,
      coalesce(g.cwins, 0) as cwins, coalesce(g.closses, 0) as closses, coalesce(g.fwins, 0) as fwins, coalesce(g.flosses, 0) as flosses,
      coalesce(a.titles, 0) as titles, coalesce(a.vices, 0) as vices, coalesce(a.thirds, 0) as thirds,
      coalesce(a.events, 0) as events, coalesce(a.achievements, 0) as achievements
    from public.profiles p
    left join g on g.uid = p.id
    left join a on a.uid = p.id
    where p.status = 'approved' and (p_gender is null or p.gender = p_gender)
      and (p_belt is null or (p.belt_verified and p.belt = p_belt))
      and (g.uid is not null or a.uid is not null)
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.points desc, x.wins desc, x.losses asc, x.name), '[]'::jsonb)
  from (
    select t.*,
      t.cwins * r.win + t.closses * r.loss + t.fwins * r.friendly_win + t.flosses * r.friendly_loss + t.events * r.participation
      + t.titles * r.champion + t.vices * r.vice + t.thirds * r.third + t.achievements * r.achievement as points
    from t, r
  ) x;
$$;

-- Ranking consolidado: em cada modalidade, pontos viram nota de 0 a 100 (o líder tem 100),
-- multiplicada pelo peso da modalidade. Assim unidades diferentes não são somadas direto.
-- p_family: null (todas), 'esporte', 'gaming' (TUTORY Gaming) ou 'esports'.
create or replace function public.sp_ranking_general(p_family text, p_gender text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  m record;
  v_rows jsonb;
  v_max numeric;
  v_all jsonb := '[]'::jsonb;
begin
  for m in select id, name from public.modalities where active and (p_family is null or family = p_family) order by sort loop
    v_rows := public.sp_ranking(m.id, p_gender, null);
    select max((x ->> 'points')::numeric) into v_max from jsonb_array_elements(v_rows) x;
    if v_max is null or v_max <= 0 then continue; end if;
    v_all := v_all || coalesce((
      select jsonb_agg(jsonb_build_object('id', x ->> 'id', 'modality', m.id, 'modality_name', m.name, 'points', (x ->> 'points')::int,
        'norm', round((x ->> 'points')::numeric / v_max * 100, 1),
        'score', round((x ->> 'points')::numeric / v_max * 100 * (private.points_for(m.id)).weight, 1)))
      from jsonb_array_elements(v_rows) x
    ), '[]'::jsonb);
  end loop;
  return coalesce((
    select jsonb_agg(row_to_json(z)::jsonb order by z.score desc, z.name)
    from (
      select p.id, p.name, p.nick, p.gender, p.avatar ->> 'thumb' as thumb,
        round(sum((e ->> 'score')::numeric), 1) as score, count(*) as modalities,
        jsonb_agg(e - 'id' order by (e ->> 'score')::numeric desc) as parts
      from jsonb_array_elements(v_all) e
      join public.profiles p on p.id = (e ->> 'id')::uuid
      group by p.id
    ) z
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- administrador (senha do schema.sql)
create or replace function public.sp_admin_pending(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  return jsonb_build_object(
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'nick', p.nick, 'gender', p.gender, 'status', p.status,
        'email', u.email, 'created_at', p.created_at, 'belt', p.belt, 'belt_verified', p.belt_verified,
        'reset', exists (select 1 from private.reset_requests r where r.email = lower(u.email))) order by p.status = 'pending' desc, p.created_at desc)
      from public.profiles p join auth.users u on u.id = p.id
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at) from public.results r where r.status = 'pending'
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.sp_admin_set_status(p_token text, p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  if p_status not in ('pending', 'approved', 'blocked') then return jsonb_build_object('error', 'Situação inválida.'); end if;
  update public.profiles set status = p_status, approved_at = case when p_status = 'approved' then now() else approved_at end where id = p_id;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sp_admin_decide(p_token text, p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  update public.results set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
  where id = p_id and status = 'pending';
  if not found then return jsonb_build_object('error', 'Resultado não encontrado ou já decidido.'); end if;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sp_admin_delete_result(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  delete from public.results where id = p_id;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

-- Lança no ranking os jogos de um campeonato já aprovados pelo administrador.
-- p_items: [{source, modality, p1, p2, winner, score}] e p_awards: [{source, modality, user_id, place, label}].
-- "source" identifica o jogo: rodar de novo não duplica nada.
create or replace function public.sp_admin_import(p_token text, p_items jsonb, p_awards jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_results int;
  v_awards int;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  insert into public.results (modality, kind, p1, p2, winner, score, source, status, decided_at, category, played_on)
  select i.modality, 'campeonato', i.p1, i.p2, i.winner, private.clean(i.score, 40), i.source, 'approved', now(), i.category, coalesce(i.played_on, current_date)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(source text, modality text, p1 uuid, p2 uuid, winner uuid, score text, category text, played_on date)
  where private.approved(i.p1) and private.approved(i.p2) and i.p1 <> i.p2 and i.winner in (i.p1, i.p2)
  on conflict (source) do update set winner = excluded.winner, score = excluded.score, category = excluded.category
    where (public.results.winner, public.results.score, public.results.category) is distinct from (excluded.winner, excluded.score, excluded.category);
  get diagnostics v_results = row_count;
  insert into public.awards (modality, user_id, place, label, source, category)
  select a.modality, a.user_id, a.place, left(a.label, 80), a.source, a.category
  from jsonb_to_recordset(coalesce(p_awards, '[]'::jsonb)) as a(source text, modality text, user_id uuid, place text, label text, category text)
  where private.approved(a.user_id) and a.place in ('campeao', 'vice', 'terceiro', 'participacao')
  on conflict (source) do update set user_id = excluded.user_id, category = excluded.category
    where (public.awards.user_id, public.awards.category) is distinct from (excluded.user_id, excluded.category);
  get diagnostics v_awards = row_count;
  perform private.sports_bump();
  return jsonb_build_object('results', v_results, 'awards', v_awards);
end $$;

-- ---------------------------------------------------------------- pontuação, faixas, modalidades, conquistas e auditoria (fase 3)
-- Pontuação de uma modalidade ('*' = padrão). p_rules: {win, loss, friendly_win, friendly_loss, participation,
-- champion, vice, third, achievement, weight}. p_rules null apaga a linha própria (volta a usar a padrão).
create or replace function public.sp_admin_set_points(p_token text, p_modality text, p_rules jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  if p_modality <> '*' and not exists (select 1 from public.modalities where id = p_modality) then
    return jsonb_build_object('error', 'Modalidade inválida.');
  end if;
  if p_rules is null then
    if p_modality = '*' then return jsonb_build_object('error', 'A pontuação padrão não pode ser apagada.'); end if;
    delete from public.ranking_points where modality = p_modality;
  else
    insert into public.ranking_points as r (modality, win, loss, friendly_win, friendly_loss, participation, champion, vice, third, achievement, weight, updated_at)
    values (p_modality, (p_rules ->> 'win')::int, (p_rules ->> 'loss')::int, (p_rules ->> 'friendly_win')::int, (p_rules ->> 'friendly_loss')::int,
      (p_rules ->> 'participation')::int, (p_rules ->> 'champion')::int, (p_rules ->> 'vice')::int, (p_rules ->> 'third')::int,
      (p_rules ->> 'achievement')::int, (p_rules ->> 'weight')::numeric, now())
    on conflict (modality) do update set win = excluded.win, loss = excluded.loss, friendly_win = excluded.friendly_win,
      friendly_loss = excluded.friendly_loss, participation = excluded.participation, champion = excluded.champion, vice = excluded.vice,
      third = excluded.third, achievement = excluded.achievement, weight = excluded.weight, updated_at = now();
  end if;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
exception
  when not_null_violation or check_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('error', 'Pontuação inválida: use números inteiros de 0 a 1000 e peso de 0 a 10.');
end $$;

-- Valida (ou corrige) a faixa de uma conta.
create or replace function public.sp_admin_set_belt(p_token text, p_id uuid, p_belt text, p_verified boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  if not private.valid_belt(private.clean(p_belt, 20)) then return jsonb_build_object('error', 'Faixa inválida.'); end if;
  update public.profiles set belt = private.clean(p_belt, 20), belt_verified = coalesce(p_verified, false) and p_belt is not null where id = p_id;
  if not found then return jsonb_build_object('error', 'Conta não encontrada.'); end if;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

-- Cria ou edita uma modalidade (modalidades futuras). Desativar esconde das telas sem apagar resultados.
create or replace function public.sp_admin_save_modality(p_token text, p_m jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id text := lower(private.clean(p_m ->> 'id', 30));
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  if v_id is null or v_id !~ '^[a-z0-9-]{2,30}$' then return jsonb_build_object('error', 'Código da modalidade: letras minúsculas, números ou hífen.'); end if;
  if private.clean(p_m ->> 'name', 40) is null then return jsonb_build_object('error', 'Informe o nome da modalidade.'); end if;
  insert into public.modalities as m (id, name, family, kind, score_hint, active, sort)
  values (v_id, private.clean(p_m ->> 'name', 40), coalesce(p_m ->> 'family', 'esporte'), coalesce(p_m ->> 'kind', 'individual'),
    private.clean(p_m ->> 'score_hint', 60), coalesce((p_m ->> 'active')::boolean, true), coalesce((p_m ->> 'sort')::int, 50))
  on conflict (id) do update set name = excluded.name, family = excluded.family, kind = excluded.kind,
    score_hint = excluded.score_hint, active = excluded.active, sort = excluded.sort;
  perform private.sports_bump();
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when check_violation or invalid_text_representation then
    return jsonb_build_object('error', 'Dados da modalidade inválidos.');
end $$;

-- Conquista manual (ex.: "Maior sequência de vitórias"), com os pontos de "conquista" da modalidade.
create or replace function public.sp_admin_award(p_token text, p_user uuid, p_modality text, p_label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  if not private.approved(p_user) then return jsonb_build_object('error', 'Escolha uma conta aprovada.'); end if;
  if not exists (select 1 from public.modalities where id = p_modality) then return jsonb_build_object('error', 'Modalidade inválida.'); end if;
  if private.clean(p_label, 80) is null then return jsonb_build_object('error', 'Descreva a conquista.'); end if;
  if exists (select 1 from public.awards where user_id = p_user and modality = p_modality and place = 'conquista' and lower(label) = lower(private.clean(p_label, 80))) then
    return jsonb_build_object('error', 'Essa pessoa já tem essa conquista nesta modalidade.');
  end if;
  insert into public.awards (modality, user_id, place, label) values (p_modality, p_user, 'conquista', private.clean(p_label, 80)) returning id into v_id;
  perform private.sports_bump();
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.sp_admin_delete_award(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  delete from public.awards where id = p_id;
  if not found then return jsonb_build_object('error', 'Registro não encontrado.'); end if;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sp_admin_audit(p_token text, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc) from (
    select * from private.audit order by at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) a), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- nova senha sem servidor de e-mail
-- O e-mail padrão do Supabase só envia para membros do projeto. Então a pessoa pede uma senha
-- nova, o administrador vê o pedido e gera uma senha provisória para entregar pessoalmente.
create table if not exists private.reset_requests (
  email text primary key,
  created_at timestamptz not null default now()
);

create or replace function public.sp_request_reset(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip text := private.client_ip();
begin
  if private.is_blocked(v_ip) then return jsonb_build_object('error', 'Muitas tentativas. Aguarde 30 segundos.'); end if;
  perform private.register_failure(v_ip); -- limita pedidos em sequência
  -- Mesma resposta exista ou não a conta, para não revelar quem tem cadastro.
  if exists (select 1 from auth.users where lower(email) = v_email) then
    insert into private.reset_requests (email) values (v_email) on conflict (email) do update set created_at = now();
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sp_admin_reset_password(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_pw text := '';
  v_email text;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  for i in 0..9 loop
    v_pw := v_pw || substr(v_alphabet, get_byte(v_bytes, i) % length(v_alphabet) + 1, 1);
  end loop;
  update auth.users set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf', 10)), updated_at = now()
  where id = p_id returning email into v_email;
  if v_email is null then return jsonb_build_object('error', 'Conta não encontrada.'); end if;
  delete from private.reset_requests where email = lower(v_email);
  return jsonb_build_object('password', v_pw, 'email', v_email);
end $$;

-- ---------------------------------------------------------------- permissões das funções
do $$
declare f text;
begin
  foreach f in array array[
    'sp_save_profile(text, text, text, text)', 'sp_save_my_avatar(jsonb)',
    'sp_report_result(text, uuid, boolean, text, text, date, uuid[], uuid[])', 'sp_cancel_result(uuid)',
    'sp_ranking(text, text, text)', 'sp_ranking_general(text, text)', 'sp_admin_pending(text)', 'sp_admin_set_status(text, uuid, text)',
    'sp_admin_decide(text, uuid, boolean)', 'sp_admin_delete_result(text, uuid)', 'sp_admin_import(text, jsonb, jsonb)',
    'sp_request_reset(text)', 'sp_admin_reset_password(text, uuid)',
    'sp_admin_set_points(text, text, jsonb)', 'sp_admin_set_belt(text, uuid, text, boolean)', 'sp_admin_save_modality(text, jsonb)',
    'sp_admin_award(text, uuid, text, text)', 'sp_admin_delete_award(text, uuid)', 'sp_admin_audit(text, int)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
select 'Pronto: Tutory Sports preparado (contas, modalidades, resultados e rankings por modalidade).' as resultado;
