-- Tutory Sports: financeiro do futebol em tabela protegida.
--
-- COMO USAR: rode DEPOIS do schema.sql e do sports.sql, que já estão no banco.
-- Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- Pode rodar de novo com segurança: os dados são mantidos.
--
-- Segurança:
-- - A tabela fica no schema private, que o site não alcança pela API.
-- - Só duas funções acessam a tabela, e as duas exigem a sessão do administrador (a mesma senha do campeonato).
-- - Visitantes e participantes logados não leem nem gravam nada daqui.
-- - Gravações usam número de revisão: dois aparelhos do administrador não apagam o trabalho um do outro.

create table if not exists private.football_finance (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  rev int not null default 0,
  updated_at timestamptz not null default now()
);
insert into private.football_finance (id) values (1) on conflict (id) do nothing;
revoke all on private.football_finance from public, anon, authenticated;

create or replace function public.sp_fin_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v private.football_finance;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  select * into v from private.football_finance where id = 1;
  return jsonb_build_object('data', coalesce(v.data, '{}'::jsonb), 'rev', coalesce(v.rev, 0));
end $$;

create or replace function public.sp_fin_save(p_token text, p_rev int, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_rev int;
begin
  if not private.is_admin(p_token) then
    return jsonb_build_object('unauthorized', true, 'error', 'Sessão de administrador expirada. Entre novamente.');
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or length(p_data::text) > 300000 then
    return jsonb_build_object('error', 'Dados do financeiro inválidos.');
  end if;
  update private.football_finance set data = p_data, rev = rev + 1, updated_at = now()
    where id = 1 and rev = p_rev
    returning rev into v_rev;
  if v_rev is null then
    return jsonb_build_object('conflict', true, 'error', 'O financeiro foi alterado em outro aparelho. Os dados foram recarregados; repita a ação.');
  end if;
  return jsonb_build_object('rev', v_rev);
end $$;

revoke all on function public.sp_fin_get(text) from public;
revoke all on function public.sp_fin_save(text, int, jsonb) from public;
grant execute on function public.sp_fin_get(text) to anon, authenticated;
grant execute on function public.sp_fin_save(text, int, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
select 'Pronto: financeiro do futebol protegido.' as resultado;
