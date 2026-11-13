-- =====================================================================
-- Sedentos · Aviso de aniversário dos discípulos (v7)
-- Controle de envio: um e-mail por discipulador por dia (a função avisar-aniversarios usa a service role).
-- =====================================================================

create table public.avisos_aniversario (
  destinatario_id uuid not null references public.jovens (id) on delete cascade,
  data            date not null,
  enviado_em      timestamptz not null default now(),
  primary key (destinatario_id, data)
);

alter table public.avisos_aniversario enable row level security;
revoke all on public.avisos_aniversario from anon, authenticated;
