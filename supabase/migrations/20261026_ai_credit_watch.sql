-- Surveillance des credits OpenAI (Edge Function ai-credits-watch).
-- Une ligne par fournisseur ; un email ne part que sur un changement de status.

create table if not exists cosme_check.ai_credit_watch (
  provider      text primary key,
  status        text not null default 'ok' check (status in ('ok', 'down')),
  fail_streak   integer not null default 0,
  changed_at    timestamptz not null default now(),
  last_check_at timestamptz,
  last_result   text,
  last_detail   text
);

-- Acces service_role uniquement (aucune policy = refus pour anon/authenticated).
alter table cosme_check.ai_credit_watch enable row level security;

insert into cosme_check.ai_credit_watch (provider) values ('openai')
on conflict (provider) do nothing;

-- Toutes les heures, a la minute 40 (health-alert tourne a la minute 20).
select cron.schedule(
  'cosme_check_ai_credits_watch',
  '40 * * * *',
  $$select cosme_check.call_edge('ai-credits-watch');$$
);
