-- Tutory Sports, fase 8: agenda, notificações, comunidade e regulamentos por modalidade. 09/11/2026
-- Rodar uma vez no SQL Editor do Supabase, depois de sports.sql (usa profiles, modalities, private.is_admin e o sinal sports_signal).
-- Regras decididas pelo Paulo:
--   comentários e reações: só contas aprovadas; qualquer conta denuncia; o administrador oculta, remove e silencia;
--   notificações: central no site (sem push com o site fechado);
--   agenda: o administrador marca; contas aprovadas também propõem amistosos, e o adversário aceita ou recusa.

-- ---------------------------------------------------------------- tabelas
create table if not exists public.agenda (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('evento', 'partida', 'amistoso')),
  modality text references public.modalities (id),
  title text not null,
  starts_at timestamptz not null,
  location text,
  notes text,
  participants uuid[] not null default '{}',
  proposed_by uuid references public.profiles (id) on delete set null, -- vazio: marcado pelo administrador
  status text not null default 'confirmed' check (status in ('proposed', 'confirmed', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agenda_starts on public.agenda (starts_at);

create table if not exists public.agenda_rsvp (
  agenda_id uuid not null references public.agenda (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null check (answer in ('sim', 'nao')),
  at timestamptz not null default now(),
  primary key (agenda_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe text, -- a mesma notificação nunca chega duas vezes
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe)
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  target text not null check (target ~ '^[a-z]+:[A-Za-z0-9:_-]{1,160}$'), -- ex.: match:<evento>:<categoria>:<partida>
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  hidden boolean not null default false,
  hidden_at timestamptz
);
create index if not exists comments_target on public.comments (target, created_at);

create table if not exists public.reactions (
  target text not null check (target ~ '^[a-z]+:[A-Za-z0-9:_-]{1,160}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('aplauso', 'fogo', 'trofeu', 'risada', 'uau')),
  at timestamptz not null default now(),
  primary key (target, user_id, emoji)
);

create table if not exists public.comment_reports (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  at timestamptz not null default now(),
  resolved boolean not null default false,
  primary key (comment_id, user_id)
);

alter table public.profiles add column if not exists muted boolean not null default false;

create table if not exists public.regulations (
  id uuid primary key default gen_random_uuid(),
  modality text not null check (modality ~ '^[a-z0-9_-]{2,30}$'), -- inclui modalidades fora do ranking, como futebol
  version int not null,
  title text not null,
  official text,  -- regras oficiais (resumo, com a fonte)
  internal text,  -- adaptações internas da Tutory
  sources text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (modality, version)
);

-- ---------------------------------------------------------------- leitura (RLS) e escrita só por funções
alter table public.agenda enable row level security;
alter table public.agenda_rsvp enable row level security;
alter table public.notifications enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.comment_reports enable row level security;
alter table public.regulations enable row level security;

drop policy if exists "publica ou envolvido" on public.agenda;
create policy "publica ou envolvido" on public.agenda for select to anon, authenticated
  using (status in ('confirmed', 'cancelled') or (select auth.uid()) = any (participants) or proposed_by = (select auth.uid()));
drop policy if exists "leitura publica" on public.agenda_rsvp;
create policy "leitura publica" on public.agenda_rsvp for select to anon, authenticated using (true);
drop policy if exists "so as minhas" on public.notifications;
create policy "so as minhas" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "visiveis ou meus" on public.comments;
create policy "visiveis ou meus" on public.comments for select to anon, authenticated using (not hidden or user_id = (select auth.uid()));
drop policy if exists "leitura publica" on public.reactions;
create policy "leitura publica" on public.reactions for select to anon, authenticated using (true);
drop policy if exists "publicados" on public.regulations;
create policy "publicados" on public.regulations for select to anon, authenticated using (status = 'published');

revoke insert, update, delete on public.agenda, public.agenda_rsvp, public.notifications, public.comments, public.reactions,
  public.comment_reports, public.regulations from anon, authenticated;
revoke all on public.comment_reports from anon, authenticated;
grant select on public.agenda, public.agenda_rsvp, public.notifications, public.comments, public.reactions, public.regulations to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['agenda', 'comments', 'regulations'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function private.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- auxiliares
create or replace function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link, dedupe)
  select p_user, p_kind, left(p_title, 140), left(p_body, 400), p_link, p_dedupe
  where p_user is not null and private.approved(p_user)
  on conflict (user_id, dedupe) do nothing;
$$;

create or replace function private.when_br(p timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
$$;

create or replace function private.name_of(p uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(nick, ''), name) from public.profiles where id = p;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- agenda
-- Administrador: cria ou altera um compromisso e avisa cada participante (de novo, se mudar a data).
create or replace function public.sp_agenda_admin_save(p_token text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_title text := private.clean(p_item ->> 'title', 120);
  v_at timestamptz := (p_item ->> 'starts_at')::timestamptz;
  v_kind text := coalesce(p_item ->> 'kind', 'evento');
  v_mod text := nullif(p_item ->> 'modality', '');
  v_people uuid[] := coalesce(array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p_item -> 'participants', '[]')) x), '{}');
  v_place text := private.clean(p_item ->> 'location', 120);
  v_u uuid;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  if v_title is null then return jsonb_build_object('error', 'Informe o título.'); end if;
  if v_at is null then return jsonb_build_object('error', 'Informe data e horário.'); end if;
  if v_kind not in ('evento', 'partida', 'amistoso') then return jsonb_build_object('error', 'Tipo inválido.'); end if;
  if v_mod is not null and not exists (select 1 from public.modalities where id = v_mod) then return jsonb_build_object('error', 'Modalidade inválida.'); end if;
  if cardinality(v_people) > 60 then return jsonb_build_object('error', 'No máximo 60 participantes por compromisso.'); end if;
  if exists (select 1 from unnest(v_people) x where not private.approved(x)) then return jsonb_build_object('error', 'Todos os participantes precisam ter conta aprovada.'); end if;
  if v_id is null then
    insert into public.agenda (kind, modality, title, starts_at, location, notes, participants, status)
    values (v_kind, v_mod, v_title, v_at, v_place, private.clean(p_item ->> 'notes', 600), v_people, 'confirmed') returning id into v_id;
  else
    update public.agenda set kind = v_kind, modality = v_mod, title = v_title, starts_at = v_at, location = v_place,
      notes = private.clean(p_item ->> 'notes', 600), participants = v_people, status = 'confirmed', updated_at = now()
    where id = v_id;
    if not found then return jsonb_build_object('error', 'Compromisso não encontrado.'); end if;
  end if;
  foreach v_u in array v_people loop
    perform private.notify(v_u, 'agenda', 'Agendado: ' || v_title, private.when_br(v_at) || coalesce(' · ' || v_place, ''), '#/agenda',
      'agenda:' || v_id || ':' || extract(epoch from v_at)::bigint);
  end loop;
  perform private.sports_bump();
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.sp_agenda_admin_cancel(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.agenda; v_u uuid;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  update public.agenda set status = 'cancelled', updated_at = now() where id = p_id and status <> 'cancelled' returning * into v;
  if v.id is null then return jsonb_build_object('error', 'Compromisso não encontrado ou já cancelado.'); end if;
  foreach v_u in array v.participants loop
    perform private.notify(v_u, 'agenda', 'Cancelado: ' || v.title, private.when_br(v.starts_at), '#/agenda', 'agenda-cancel:' || v.id);
  end loop;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

-- Conta aprovada propõe um amistoso com data; o adversário recebe o convite.
create or replace function public.sp_agenda_propose(p_modality text, p_opponent uuid, p_starts_at timestamptz, p_location text, p_notes text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
begin
  if v_uid is null then return jsonb_build_object('error', 'Entre na sua conta.'); end if;
  if not private.approved(v_uid) then return jsonb_build_object('error', 'Sua conta ainda aguarda aprovação do administrador.'); end if;
  if p_opponent is null or p_opponent = v_uid or not private.approved(p_opponent) then return jsonb_build_object('error', 'Escolha um adversário com conta aprovada.'); end if;
  select name into v_name from public.modalities where id = p_modality and active;
  if v_name is null then return jsonb_build_object('error', 'Modalidade inválida.'); end if;
  if p_starts_at is null or p_starts_at < now() or p_starts_at > now() + interval '90 days' then
    return jsonb_build_object('error', 'Escolha uma data nos próximos 90 dias.');
  end if;
  if (select count(*) from public.agenda where proposed_by = v_uid and status = 'proposed') >= 10 then
    return jsonb_build_object('error', 'Você já tem 10 convites aguardando resposta.');
  end if;
  if exists (select 1 from public.agenda where proposed_by = v_uid and status in ('proposed', 'confirmed') and modality = p_modality
      and participants @> array[v_uid, p_opponent] and starts_at = p_starts_at) then
    return jsonb_build_object('error', 'Esse convite já foi enviado.');
  end if;
  insert into public.agenda (kind, modality, title, starts_at, location, notes, participants, proposed_by, status)
  values ('amistoso', p_modality, 'Amistoso de ' || v_name, p_starts_at, private.clean(p_location, 120), private.clean(p_notes, 600),
    array[v_uid, p_opponent], v_uid, 'proposed')
  returning id into v_id;
  perform private.notify(p_opponent, 'convite', private.name_of(v_uid) || ' chamou você para um amistoso de ' || v_name,
    private.when_br(p_starts_at) || coalesce(' · ' || private.clean(p_location, 120), '') || '. Aceite ou recuse na agenda.', '#/agenda', 'agenda-invite:' || v_id);
  perform private.sports_bump();
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.sp_agenda_answer(p_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.agenda; v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('error', 'Entre na sua conta.'); end if;
  update public.agenda set status = case when p_accept then 'confirmed' else 'declined' end, updated_at = now()
  where id = p_id and status = 'proposed' and v_uid = any (participants) and proposed_by is distinct from v_uid
  returning * into v;
  if v.id is null then return jsonb_build_object('error', 'Convite não encontrado ou já respondido.'); end if;
  perform private.notify(v.proposed_by, 'convite', private.name_of(v_uid) || case when p_accept then ' aceitou' else ' recusou' end || ' o amistoso',
    private.when_br(v.starts_at), '#/agenda', 'agenda-answer:' || v.id);
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sp_agenda_cancel_mine(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.agenda; v_uid uuid := auth.uid(); v_u uuid;
begin
  if v_uid is null then return jsonb_build_object('error', 'Entre na sua conta.'); end if;
  update public.agenda set status = 'cancelled', updated_at = now()
  where id = p_id and proposed_by = v_uid and status in ('proposed', 'confirmed') returning * into v;
  if v.id is null then return jsonb_build_object('error', 'Só quem propôs pode cancelar.'); end if;
  foreach v_u in array v.participants loop
    if v_u <> v_uid then perform private.notify(v_u, 'agenda', 'Cancelado: ' || v.title, private.when_br(v.starts_at), '#/agenda', 'agenda-cancel:' || v.id); end if;
  end loop;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

-- Participante confirma (ou não) presença num compromisso confirmado.
create or replace function public.sp_agenda_rsvp(p_id uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('error', 'Entre na sua conta.'); end if;
  if p_answer not in ('sim', 'nao') then return jsonb_build_object('error', 'Resposta inválida.'); end if;
  if not exists (select 1 from public.agenda where id = p_id and status = 'confirmed' and v_uid = any (participants) and starts_at > now() - interval '1 day') then
    return jsonb_build_object('error', 'Só quem foi chamado confirma presença, antes do compromisso.');
  end if;
  insert into public.agenda_rsvp (agenda_id, user_id, answer) values (p_id, v_uid, p_answer)
  on conflict (agenda_id, user_id) do update set answer = excluded.answer, at = now();
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sp_notifications_read(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return jsonb_build_object('error', 'Entre na sua conta.'); end if;
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- comunidade
create or replace function public.sp_comment(p_target text, p_body text, p_parent uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_body text := nullif(left(btrim(coalesce(p_body, '')), 500), '');
  v_id uuid;
  v_parent public.comments;
begin
  if v_uid is null then return jsonb_build_object('error', 'Entre na sua conta para comentar.'); end if;
  if not private.approved(v_uid) then return jsonb_build_object('error', 'Sua conta ainda aguarda aprovação do administrador.'); end if;
  if (select muted from public.profiles where id = v_uid) then return jsonb_build_object('error', 'O administrador suspendeu seus comentários.'); end if;
  if v_body is null then return jsonb_build_object('error', 'Escreva o comentário.'); end if;
  if p_target !~ '^[a-z]+:[A-Za-z0-9:_-]{1,160}$' then return jsonb_build_object('error', 'Destino inválido.'); end if;
  if exists (select 1 from public.comments where user_id = v_uid and created_at > now() - interval '5 seconds') then
    return jsonb_build_object('error', 'Espere alguns segundos antes de comentar de novo.');
  end if;
  if (select count(*) from public.comments where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('error', 'Limite de 30 comentários por hora.');
  end if;
  if p_parent is not null then
    select * into v_parent from public.comments where id = p_parent;
    if v_parent.id is null or v_parent.target <> p_target or v_parent.hidden then return jsonb_build_object('error', 'Comentário respondido não existe mais.'); end if;
    if v_parent.parent_id is not null then p_parent := v_parent.parent_id; end if; -- respostas ficam em um nível só
  end if;
  insert into public.comments (target, user_id, parent_id, body) values (p_target, v_uid, p_parent, v_body) returning id into v_id;
  if v_parent.id is not null and v_parent.user_id <> v_uid then
    perform private.notify(v_parent.user_id, 'resposta', private.name_of(v_uid) || ' respondeu seu comentário', left(v_body, 120), null, 'reply:' || v_id);
  end if;
  perform private.sports_bump();
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.sp_comment_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.comments where id = p_id and user_id = auth.uid();
  if not found then return jsonb_build_object('error', 'Só quem escreveu pode apagar.'); end if;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sp_react(p_target text, p_emoji text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('error', 'Entre na sua conta para reagir.'); end if;
  if not private.approved(v_uid) then return jsonb_build_object('error', 'Sua conta ainda aguarda aprovação do administrador.'); end if;
  if p_emoji not in ('aplauso', 'fogo', 'trofeu', 'risada', 'uau') or p_target !~ '^[a-z]+:[A-Za-z0-9:_-]{1,160}$' then
    return jsonb_build_object('error', 'Reação inválida.');
  end if;
  delete from public.reactions where target = p_target and user_id = v_uid and emoji = p_emoji;
  if not found then insert into public.reactions (target, user_id, emoji) values (p_target, v_uid, p_emoji); end if;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sp_report_comment(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.approved(auth.uid()) then return jsonb_build_object('error', 'Entre com uma conta aprovada para denunciar.'); end if;
  if not exists (select 1 from public.comments where id = p_id) then return jsonb_build_object('error', 'Comentário não encontrado.'); end if;
  insert into public.comment_reports (comment_id, user_id, reason) values (p_id, auth.uid(), private.clean(p_reason, 200))
  on conflict (comment_id, user_id) do update set reason = excluded.reason, at = now(), resolved = false;
  return jsonb_build_object('ok', true);
end $$;

-- Painel: comentários denunciados (não resolvidos) e os ocultos, com autor.
create or replace function public.sp_admin_reports(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.reports desc, x.created_at desc) from (
      select c.id, c.target, c.body, c.created_at, c.hidden, c.user_id, p.name as author, p.muted,
        (select count(*) from public.comment_reports r where r.comment_id = c.id and not r.resolved) as reports,
        (select string_agg(coalesce(r.reason, 'sem motivo'), ' · ') from public.comment_reports r where r.comment_id = c.id and not r.resolved) as reasons
      from public.comments c join public.profiles p on p.id = c.user_id
      where c.hidden or exists (select 1 from public.comment_reports r where r.comment_id = c.id and not r.resolved)
      limit 200) x), '[]'::jsonb);
end $$;

create or replace function public.sp_admin_comment(p_token text, p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  if p_action = 'hide' then update public.comments set hidden = true, hidden_at = now() where id = p_id;
  elsif p_action = 'show' then update public.comments set hidden = false, hidden_at = null where id = p_id;
  elsif p_action = 'delete' then delete from public.comments where id = p_id;
  elsif p_action <> 'dismiss' then return jsonb_build_object('error', 'Ação inválida.');
  end if;
  update public.comment_reports set resolved = true where comment_id = p_id;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sp_admin_mute(p_token text, p_user uuid, p_mute boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  update public.profiles set muted = p_mute where id = p_user;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- regulamentos (versões)
create or replace function public.sp_admin_regulations(p_token text, p_modality text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.version desc) from public.regulations r where r.modality = p_modality), '[]'::jsonb);
end $$;

-- Rascunho: altera o rascunho aberto da modalidade ou cria a próxima versão. Versões publicadas nunca mudam.
create or replace function public.sp_admin_regulation_save(p_token text, p_r jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_mod text := p_r ->> 'modality';
  v_title text := private.clean(p_r ->> 'title', 120);
  v_id uuid;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  if v_mod is null or v_mod !~ '^[a-z0-9_-]{2,30}$' then return jsonb_build_object('error', 'Modalidade inválida.'); end if;
  if v_title is null then return jsonb_build_object('error', 'Informe o título.'); end if;
  select id into v_id from public.regulations where modality = v_mod and status = 'draft';
  if v_id is null then
    insert into public.regulations (modality, version, title, official, internal, sources, status)
    values (v_mod, coalesce((select max(version) from public.regulations where modality = v_mod), 0) + 1, v_title,
      left(p_r ->> 'official', 12000), left(p_r ->> 'internal', 12000), left(p_r ->> 'sources', 2000), 'draft')
    returning id into v_id;
  else
    update public.regulations set title = v_title, official = left(p_r ->> 'official', 12000), internal = left(p_r ->> 'internal', 12000),
      sources = left(p_r ->> 'sources', 2000) where id = v_id;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.sp_admin_regulation_publish(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  perform set_config('app.actor', 'administrador', true);
  update public.regulations set status = 'published', published_at = now() where id = p_id and status = 'draft';
  if not found then return jsonb_build_object('error', 'Rascunho não encontrado.'); end if;
  perform private.sports_bump();
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- regulamentos iniciais (versão 1, publicada)
-- Oficial: resumo das regras das entidades citadas. Interno: adaptações da Tutory, editáveis pelo administrador.
insert into public.regulations (modality, version, title, official, internal, sources, status, published_at) values
('pingpong', 1, 'Ping Pong (tênis de mesa)',
'• O game termina quando alguém chega a 11 pontos, com 2 de diferença. Em 10 x 10, segue até um abrir 2.
• A partida é em melhor de um número ímpar de games.
• Saque: a bola parte da palma aberta e parada, é lançada quase na vertical a pelo menos 16 cm e golpeada na descida. Ela quica primeiro no lado de quem saca e depois no lado de quem recebe, sempre visível para o recebedor.
• O saque troca a cada 2 pontos; a partir de 10 x 10, a cada ponto.
• Saque que toca a rede e cai certo é repetido (let).
• Perde o ponto quem: erra o saque ou a devolução; golpeia a bola antes de ela quicar no próprio lado da mesa; toca a mesa com a mão livre; move a mesa; toca a rede.
• Os jogadores trocam de lado a cada game e, no game decisivo, quando alguém chega a 5 pontos.',
'• Melhor de games, pontos e vantagem seguem a configuração de cada campeonato ou de cada confronto (padrão: melhor de 3, games de 11).
• Disputa de 3º lugar entre os perdedores das semifinais. Repescagem para os eliminados da 1ª rodada, quando o administrador ativar.
• Ausente 10 minutos depois de chamado perde por WO.
• O resultado só vale depois de registrado e confirmado pelo administrador.',
'ITTF — Handbook, capítulo 2 (Leis do Tênis de Mesa).', 'published', now()),
('jiujitsu', 1, 'Jiu-Jitsu',
'• Pontos: queda 2; raspagem 2; joelho na barriga 2; passagem de guarda 3; montada 4; pegada pelas costas (com os ganchos) 4.
• Vantagens contam quando alguém quase completa uma posição de pontos; punições por falta de combatividade e infrações.
• Vitória por: finalização; pontos; vantagens; punições; decisão do árbitro; desclassificação.
• Tempo de luta no adulto: faixa branca 5 min, azul 6, roxa 7, marrom 8, preta 10.
• As técnicas proibidas variam por faixa e idade e seguem a tabela da IBJJF.',
'• A faixa que vale é a validada pelo administrador. Rankings e chaves podem ser por faixa.
• Bateu, parou: o pedido de desistência (bater ou falar) encerra a luta na hora. Na dúvida sobre uma técnica, ela é proibida.
• Categorias de peso só quando o administrador definir no evento.
• Lutas registradas como amistoso precisam de aprovação para valer no ranking.',
'IBJJF — Livro de Regras (General Rules Book).', 'published', now()),
('futebol', 1, 'Futebol de terça',
NULL,
'• Times de 5 jogadores. Os 10 primeiros presentes são sorteados em dois times; os demais formam a fila, em grupos de até 5, pela ordem de chegada.
• Quem vence fica; quem perde volta para o fim da fila. O próximo grupo da fila entra.
• Time incompleto é completado com os primeiros nomes da fila, sem pular ninguém.
• Quem desistir sai das próximas escalações; o histórico das rodadas jogadas fica guardado.
• Duração de cada rodada e regra de empate: definidas pelo administrador no dia (ainda sem regra fixa).
• O valor da quadra é dividido entre os participantes do rateio, conforme o painel financeiro.',
'Regra interna da Tutory (não há regulamento oficial para o formato de rodízio).', 'published', now()),
('gaming', 1, 'Tutory Gaming (EA FC, Call of Duty, Mortal Kombat)',
NULL,
'• EA FC: partidas 1 contra 1, com os times escolhidos livremente e tempo de jogo combinado antes de começar. No mata-mata, empate vai para a prorrogação e os pênaltis do próprio jogo.
• Mortal Kombat: cada luta vale o padrão do jogo (2 rounds para vencer). No mata-mata, melhor de 3 lutas.
• Call of Duty: modo, mapa e critério de vitória combinados antes, e iguais para os dois lados.
• Queda de conexão ou falha do console: a partida é refeita do início, salvo acordo entre os jogadores.
• Resultados de amistosos só contam no ranking depois da aprovação do administrador.',
'Regra interna da Tutory. Regras de jogo de cada título conforme as configurações oficiais do próprio jogo.', 'published', now()),
('cs', 1, 'Counter-Strike',
'• 5 contra 5. Vence quem chegar primeiro a 13 rounds (MR12, 24 rounds no total), com troca de lados depois do 12º round.
• Em 12 x 12, prorrogação em blocos de 6 rounds (vence quem fizer 4); persiste o empate, novo bloco.
• Configurações do modo Competitivo oficial.',
'• As equipes são formadas por contas aprovadas, até 5 por lado. A mesma pessoa não joga pelos dois lados.
• Mapas escolhidos por veto alternado entre os capitães.
• O resultado é lançado por equipe e precisa da aprovação do administrador para valer no ranking.',
'Valve — configurações do modo Competitivo do Counter-Strike 2 (MR12).', 'published', now())
on conflict (modality, version) do nothing;

-- ---------------------------------------------------------------- permissões das funções
do $$
declare f text;
begin
  foreach f in array array[
    'sp_agenda_admin_save(text, jsonb)', 'sp_agenda_admin_cancel(text, uuid)', 'sp_agenda_propose(text, uuid, timestamptz, text, text)',
    'sp_agenda_answer(uuid, boolean)', 'sp_agenda_cancel_mine(uuid)', 'sp_agenda_rsvp(uuid, text)', 'sp_notifications_read(uuid[])',
    'sp_comment(text, text, uuid)', 'sp_comment_delete(uuid)', 'sp_react(text, text)', 'sp_report_comment(uuid, text)',
    'sp_admin_reports(text)', 'sp_admin_comment(text, uuid, text)', 'sp_admin_mute(text, uuid, boolean)',
    'sp_admin_regulations(text, text)', 'sp_admin_regulation_save(text, jsonb)', 'sp_admin_regulation_publish(text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
select 'Pronto: agenda, notificações, comunidade e regulamentos por modalidade.' as resultado;
