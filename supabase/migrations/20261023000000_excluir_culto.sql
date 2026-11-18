-- =====================================================================
-- Sedentos · Excluir culto (somente administradores)
-- Apaga o culto de vez, inclusive fechado: presenças e avisos saem junto
-- (on delete cascade). Sábados regulares futuros podem ser recriados por garantir_cultos().
-- =====================================================================

create or replace function public.excluir_culto(p_culto uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  delete from public.cultos where id = p_culto;
  if not found then raise exception 'Culto não encontrado.'; end if;
end;
$$;

revoke execute on function public.excluir_culto(uuid) from public, anon;
grant execute on function public.excluir_culto(uuid) to authenticated;
