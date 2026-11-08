-- Tutory Sports: campeonatos com categorias (masculino, feminino e misto). 08/11/2026
-- O avatar salvo pelo código pessoal do participante passa a procurar a pessoa dentro das categorias do evento.
-- Rodar uma vez no SQL Editor do Supabase. Não mexe em senha, contas, ranking nem futebol.

create or replace function public.pp_save_avatar(p_token text, p_id text, p_code text, p_avatar jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := private.client_ip();
  v_rev bigint;
  v_doc jsonb;
  v_cat text;
  v_found boolean;
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
  -- Formato com categorias (app/js/core/event.js): os inscritos ficam em doc.comps.<categoria>.players.
  select t.doc into v_doc from public.tournament t where t.id = 1 for update;
  v_found := false;
  for v_cat in select jsonb_object_keys(coalesce(v_doc -> 'comps', '{}'::jsonb)) loop
    if exists (select 1 from jsonb_array_elements(v_doc -> 'comps' -> v_cat -> 'players') e where e ->> 'id' = p_id) then
      v_found := true;
      v_doc := jsonb_set(v_doc, array['comps', v_cat, 'players'], (
        select jsonb_agg(
          case when x.e ->> 'id' = p_id then x.e || jsonb_build_object('avatar', p_avatar) else x.e end
          order by x.ord
        )
        from jsonb_array_elements(v_doc -> 'comps' -> v_cat -> 'players') with ordinality as x(e, ord)
      ));
    end if;
  end loop;
  if not v_found then
    return jsonb_build_object('error', 'Jogador não encontrado.');
  end if;
  update public.tournament t set
    doc = v_doc,
    rev = t.rev + 1,
    updated_at = now()
  where t.id = 1
  returning t.rev into v_rev;
  update public.tournament_signal set rev = v_rev where id = 1;
  return jsonb_build_object('rev', v_rev);
end $$;

revoke all on function public.pp_save_avatar(text, text, text, jsonb) from public;
grant execute on function public.pp_save_avatar(text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
