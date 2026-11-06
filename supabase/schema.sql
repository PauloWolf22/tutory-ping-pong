-- Tutory Ping Pong Championship: banco no Supabase.
--
-- COMO USAR: Supabase > SQL Editor > New query > cole este arquivo inteiro.
-- Troque TROQUE-ESTA-SENHA, na ÚLTIMA linha, pela senha de administrador e clique em Run.
-- Pode rodar de novo com segurança: os dados do campeonato são mantidos.
--
-- Modelo de segurança: a chave anon do site só lê o campeonato.
-- Toda gravação passa por funções pp_*, que conferem a sessão ou o código do jogador.
-- Senha, sessões e segredo ficam no schema private, que não é exposto pela API.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.config (
  id int primary key default 1 check (id = 1),
  password_hash text,
  code_secret bytea not null default extensions.gen_random_bytes(32)
);
insert into private.config (id) values (1) on conflict (id) do nothing;

create table if not exists private.sessions (
  token_hash bytea primary key,
  expires_at timestamptz not null
);

create table if not exists private.attempts (
  ip text primary key,
  fails int not null default 0,
  last_fail timestamptz not null default now()
);

create table if not exists public.tournament (
  id int primary key default 1 check (id = 1),
  rev bigint not null default 0,
  doc jsonb,
  updated_at timestamptz not null default now()
);
insert into public.tournament (id) values (1) on conflict (id) do nothing;

-- Tabela pequena só para avisar os aparelhos: o Realtime tem limite de tamanho de mensagem.
create table if not exists public.tournament_signal (
  id int primary key default 1 check (id = 1),
  rev bigint not null default 0
);
insert into public.tournament_signal (id) values (1) on conflict (id) do nothing;

alter table public.tournament enable row level security;
alter table public.tournament_signal enable row level security;

drop policy if exists "leitura publica" on public.tournament;
create policy "leitura publica" on public.tournament for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.tournament_signal;
create policy "leitura publica" on public.tournament_signal for select to anon, authenticated using (true);

revoke insert, update, delete on public.tournament from anon, authenticated;
revoke insert, update, delete on public.tournament_signal from anon, authenticated;
grant select on public.tournament to anon, authenticated;
grant select on public.tournament_signal to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournament_signal'
  ) then
    alter publication supabase_realtime add table public.tournament_signal;
  end if;
end $$;

-- ---------------------------------------------------------------- funções internas
create or replace function private.client_ip() returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (nullif(current_setting('request.headers', true), '')::json) ->> 'cf-connecting-ip',
    (nullif(current_setting('request.headers', true), '')::json) ->> 'x-forwarded-for',
    'desconhecido'
  );
$$;

create or replace function private.is_blocked(p_ip text) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from private.attempts
    where ip = p_ip and fails >= 5 and last_fail > now() - interval '30 seconds'
  );
$$;

create or replace function private.register_failure(p_ip text) returns void
language sql set search_path = '' as $$
  insert into private.attempts as a (ip, fails, last_fail) values (p_ip, 1, now())
  on conflict (ip) do update set
    fails = case when a.last_fail > now() - interval '30 seconds' then a.fails + 1 else 1 end,
    last_fail = now();
$$;

create or replace function private.is_admin(p_token text) returns boolean
language sql stable set search_path = '' as $$
  select p_token is not null and exists (
    select 1 from private.sessions
    where token_hash = extensions.digest(p_token, 'sha256') and expires_at > now()
  );
$$;

create or replace function private.player_code(p_id text) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_secret bytea;
  v_digest bytea;
  v_code text := '';
begin
  select code_secret into v_secret from private.config where id = 1;
  v_digest := extensions.hmac(convert_to(p_id, 'UTF8'), v_secret, 'sha256');
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, get_byte(v_digest, i) % length(v_alphabet) + 1, 1);
  end loop;
  return v_code;
end $$;

-- Só o dono do banco chama, pelo SQL Editor. A API não alcança o schema private.
create or replace function private.set_admin_password(p_password text) returns text
language plpgsql set search_path = '' as $$
begin
  if p_password = 'TROQUE-ESTA-SENHA' then
    raise exception 'Troque TROQUE-ESTA-SENHA, na última linha do script, pela sua senha de administrador.';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Use uma senha com pelo menos 6 caracteres.';
  end if;
  update private.config set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)) where id = 1;
  delete from private.sessions;
  return 'Pronto: banco preparado e senha definida.';
end $$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- API pública
-- Erros voltam como {"error": ...}. Uma exceção desfaria o registro de tentativa errada.
create or replace function public.pp_login(p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := private.client_ip();
  v_hash text;
  v_token text;
begin
  if private.is_blocked(v_ip) then
    return jsonb_build_object('error', 'Muitas tentativas. Aguarde 30 segundos.');
  end if;
  select password_hash into v_hash from private.config where id = 1;
  if v_hash is null or p_password is null or extensions.crypt(p_password, v_hash) <> v_hash then
    perform private.register_failure(v_ip);
    return jsonb_build_object('error', 'Senha incorreta.');
  end if;
  delete from private.attempts where ip = v_ip;
  delete from private.sessions where expires_at <= now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.sessions (token_hash, expires_at)
  values (extensions.digest(v_token, 'sha256'), now() + interval '16 hours');
  return jsonb_build_object('token', v_token);
end $$;

create or replace function public.pp_session(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin(p_token);
$$;

create or replace function public.pp_logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from private.sessions where token_hash = extensions.digest(p_token, 'sha256');
$$;

create or replace function public.pp_change_password(p_token text, p_current text, p_new text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  select password_hash into v_hash from private.config where id = 1;
  if extensions.crypt(coalesce(p_current, ''), v_hash) <> v_hash then
    return jsonb_build_object('error', 'A senha atual não confere.');
  end if;
  if length(coalesce(p_new, '')) < 6 then
    return jsonb_build_object('error', 'Use uma senha com pelo menos 6 caracteres.');
  end if;
  update private.config set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Grava só se ninguém tiver salvo antes (revisão esperada), para nunca sobrescrever às cegas.
create or replace function public.pp_save_state(p_token text, p_rev bigint, p_doc jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev bigint;
  v_doc jsonb;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  if jsonb_typeof(p_doc) is distinct from 'object' or octet_length(p_doc::text) > 8000000 then
    return jsonb_build_object('error', 'Documento inválido ou grande demais.');
  end if;
  update public.tournament set rev = rev + 1, doc = p_doc, updated_at = now()
  where id = 1 and rev = p_rev
  returning rev into v_rev;
  if v_rev is null then
    select rev, doc into v_rev, v_doc from public.tournament where id = 1;
    return jsonb_build_object('conflict', true, 'rev', v_rev, 'doc', v_doc);
  end if;
  update public.tournament_signal set rev = v_rev where id = 1;
  return jsonb_build_object('rev', v_rev);
end $$;

create or replace function public.pp_player_code(p_token text, p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Entre como administrador.');
  end if;
  return jsonb_build_object('code', private.player_code(p_id));
end $$;

-- O participante altera apenas o avatar do próprio jogador, autorizado pelo código pessoal.
create or replace function public.pp_save_avatar(p_token text, p_id text, p_code text, p_avatar jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := private.client_ip();
  v_rev bigint;
begin
  if jsonb_typeof(p_avatar) is distinct from 'object' or octet_length(p_avatar::text) > 20000 then
    return jsonb_build_object('error', 'Dados do avatar inválidos.');
  end if;
  if not private.is_admin(p_token) then
    if private.is_blocked(v_ip) then
      return jsonb_build_object('error', 'Muitas tentativas. Aguarde 30 segundos.');
    end if;
    if upper(trim(coalesce(p_code, ''))) <> private.player_code(p_id) then
      perform private.register_failure(v_ip);
      return jsonb_build_object('error', 'Código do jogador incorreto.');
    end if;
  end if;
  if not exists (
    select 1 from public.tournament t, jsonb_array_elements(t.doc -> 'players') as e
    where t.id = 1 and e ->> 'id' = p_id
  ) then
    return jsonb_build_object('error', 'Jogador não encontrado.');
  end if;
  update public.tournament t set
    doc = jsonb_set(t.doc, '{players}', (
      select jsonb_agg(
        case when x.e ->> 'id' = p_id then x.e || jsonb_build_object('avatar', p_avatar) else x.e end
        order by x.ord
      )
      from jsonb_array_elements(t.doc -> 'players') with ordinality as x(e, ord)
    )),
    rev = t.rev + 1,
    updated_at = now()
  where t.id = 1
  returning t.rev into v_rev;
  update public.tournament_signal set rev = v_rev where id = 1;
  return jsonb_build_object('rev', v_rev);
end $$;

revoke all on function public.pp_login(text), public.pp_session(text), public.pp_logout(text),
  public.pp_change_password(text, text, text), public.pp_save_state(text, bigint, jsonb),
  public.pp_player_code(text, text), public.pp_save_avatar(text, text, text, jsonb) from public;
grant execute on function public.pp_login(text), public.pp_session(text), public.pp_logout(text),
  public.pp_change_password(text, text, text), public.pp_save_state(text, bigint, jsonb),
  public.pp_player_code(text, text), public.pp_save_avatar(text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- ÚLTIMA LINHA: troque pela sua senha de administrador (mínimo de 6 caracteres).
select private.set_admin_password('TROQUE-ESTA-SENHA');
