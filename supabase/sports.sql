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
drop policy if exists "leitura publica" on public.sports_signal;
create policy "leitura publica" on public.sports_signal for select to anon, authenticated using (true);

revoke insert, update, delete on public.profiles, public.modalities, public.results, public.awards,
  public.ranking_rules, public.sports_signal from anon, authenticated;
grant select on public.profiles, public.modalities, public.results, public.awards,
  public.ranking_rules, public.sports_signal to anon, authenticated;

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
  insert into public.profiles as p (id, name, nick, gender, belt)
  values (v_uid, v_name, private.clean(p_nick, 30), p_gender, private.clean(p_belt, 20))
  on conflict (id) do update set name = excluded.name, nick = excluded.nick, gender = excluded.gender, belt = excluded.belt;
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
create or replace function public.sp_report_result(p_modality text, p_opponent uuid, p_won boolean, p_score text, p_method text, p_played_on date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('error', 'Entre na sua conta.'); end if;
  if not private.approved(v_uid) then return jsonb_build_object('error', 'Sua conta ainda aguarda aprovação do administrador.'); end if;
  if not private.approved(p_opponent) or p_opponent = v_uid then return jsonb_build_object('error', 'Escolha um adversário com conta aprovada.'); end if;
  if not exists (select 1 from public.modalities where id = p_modality and active) then return jsonb_build_object('error', 'Modalidade inválida.'); end if;
  if p_played_on is not null and (p_played_on > current_date or p_played_on < current_date - 60) then
    return jsonb_build_object('error', 'A data do jogo precisa ser dos últimos 60 dias.');
  end if;
  if (select count(*) from public.results where reported_by = v_uid and status = 'pending') >= 20 then
    return jsonb_build_object('error', 'Você já tem 20 resultados aguardando aprovação.');
  end if;
  insert into public.results (modality, kind, p1, p2, winner, score, method, status, reported_by, played_on)
  values (p_modality, 'amistoso', v_uid, p_opponent, case when p_won then v_uid else p_opponent end,
    private.clean(p_score, 40), private.clean(p_method, 40), 'pending', v_uid, coalesce(p_played_on, current_date))
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
create or replace function public.sp_ranking(p_modality text, p_gender text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (select * from public.ranking_rules where id = 1),
  games as (
    select p1 as uid, (winner = p1) as won from public.results where status = 'approved' and modality = p_modality
    union all
    select p2, (winner = p2) from public.results where status = 'approved' and modality = p_modality
  ),
  g as (select uid, count(*) filter (where won) as wins, count(*) filter (where not won) as losses from games group by uid),
  a as (
    select user_id as uid, count(*) filter (where place = 'campeao') as titles, count(*) filter (where place = 'vice') as vices
    from public.awards where modality = p_modality group by user_id
  ),
  t as (
    select p.id, p.name, p.nick, p.gender, p.avatar ->> 'thumb' as thumb,
      coalesce(g.wins, 0) as wins, coalesce(g.losses, 0) as losses,
      coalesce(a.titles, 0) as titles, coalesce(a.vices, 0) as vices
    from public.profiles p
    left join g on g.uid = p.id
    left join a on a.uid = p.id
    where p.status = 'approved' and (p_gender is null or p.gender = p_gender)
      and (g.uid is not null or a.uid is not null)
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.points desc, x.wins desc, x.losses asc, x.name), '[]'::jsonb)
  from (
    select t.*, t.wins * r.win + t.losses * r.loss + t.titles * r.champion + t.vices * r.vice as points
    from t, r
  ) x;
$$;

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
        'email', u.email, 'created_at', p.created_at) order by p.status = 'pending' desc, p.created_at desc)
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
  insert into public.results (modality, kind, p1, p2, winner, score, source, status, decided_at)
  select i.modality, 'campeonato', i.p1, i.p2, i.winner, private.clean(i.score, 40), i.source, 'approved', now()
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(source text, modality text, p1 uuid, p2 uuid, winner uuid, score text)
  where private.approved(i.p1) and private.approved(i.p2) and i.p1 <> i.p2 and i.winner in (i.p1, i.p2)
  on conflict (source) do update set winner = excluded.winner, score = excluded.score;
  get diagnostics v_results = row_count;
  insert into public.awards (modality, user_id, place, label, source)
  select a.modality, a.user_id, a.place, left(a.label, 80), a.source
  from jsonb_to_recordset(coalesce(p_awards, '[]'::jsonb)) as a(source text, modality text, user_id uuid, place text, label text)
  where private.approved(a.user_id) and a.place in ('campeao', 'vice')
  on conflict (source) do update set user_id = excluded.user_id;
  get diagnostics v_awards = row_count;
  perform private.sports_bump();
  return jsonb_build_object('results', v_results, 'awards', v_awards);
end $$;

-- ---------------------------------------------------------------- permissões das funções
do $$
declare f text;
begin
  foreach f in array array[
    'sp_save_profile(text, text, text, text)', 'sp_save_my_avatar(jsonb)',
    'sp_report_result(text, uuid, boolean, text, text, date)', 'sp_cancel_result(uuid)',
    'sp_ranking(text, text)', 'sp_admin_pending(text)', 'sp_admin_set_status(text, uuid, text)',
    'sp_admin_decide(text, uuid, boolean)', 'sp_admin_delete_result(text, uuid)', 'sp_admin_import(text, jsonb, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
select 'Pronto: Tutory Sports preparado (contas, modalidades, resultados e ranking).' as resultado;
