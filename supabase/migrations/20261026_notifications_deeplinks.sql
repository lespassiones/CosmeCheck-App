-- notifications_deeplinks (26 oct 2026)
--
-- Le tap sur une notification ouvre la page dont elle parle au lieu de
-- l'accueil :
--   * quiz du jour        -> /quiz/<id de la question> (la question EXACTE de la
--     notification ; avant, l'accueil montrait une autre question, l'app tirant
--     son lot du jour dans 330 questions serveur + 1000 embarquées) ;
--   * « scanne un produit » (premier scan, relances, crédits du jour, solaire)
--     -> /(tabs)/scan?mode=barcode (caméra ouverte) ;
--   * produit faible de la routine -> /analyse/<id> (fiche avec alternatives).
-- Les versions de l'app qui ne connaissent pas ces routes les refusent
-- (allowlist lib/notifications/deepLink.ts) et restent sur l'accueil, comme
-- avant : rien ne casse pour elles.

set statement_timeout = '60s';

-- 1. Faits : id de l'analyse du produit faible de la routine ------------------
create or replace function cosme_check.notif_user_facts()
returns table (uid uuid, facts jsonb)
language sql stable security definer set search_path to 'cosme_check', 'public' as $fn$
  with u as (select distinct pt.user_id as uid from cosme_check.push_tokens pt),
  base as (
    select u.uid, up.first_name, coalesce(up.tier, 'free') as tier
    from u join cosme_check.user_profiles up on up.id = u.uid
    where coalesce(up.preferences -> 'notifications' ->> 'enabled', 'true') <> 'false'
      and up.suspended_at is null
  )
  select b.uid, jsonb_build_object(
    'prenom', nullif(initcap(split_part(btrim(coalesce(b.first_name, '')), ' ', 1)), ''),
    'tier', b.tier,
    'credits', coalesce(ct.credit_amount, case when b.tier = 'premium' then 50 else 5 end),
    'n_analyses', a.n,
    'last_analysis_id', la.id, 'last_label', la.label, 'last_score', la.score, 'last_ean', la.ean, 'last_at', la.created_at,
    'jours_inactif', case when la.created_at is null then null else floor(extract(epoch from now() - la.created_at) / 86400)::int end,
    'n_routine', r.n, 'n_soir', r.n_soir, 'produit_soir', r.produit_soir,
    'faible_label', rf.label, 'faible_score', rf.score, 'faible_analysis_id', rf.id,
    'n_promesses', c.n, 'n_advisor', adv.n, 'goal_eval', ge.ok,
    'credits_used_today', coalesce(cr.used, 0),
    'sent_today', st.n, 'slots_today', st.slots
  )
  from base b
  left join cosme_check.credit_tiers ct on ct.tier = b.tier
  cross join lateral (select count(*)::int as n from cosme_check.analyses x where x.user_id = b.uid) a
  left join lateral (
    select x.id, x.ean, x.score, x.created_at, coalesce(nullif(btrim(x.product_label), ''), x.name) as label
    from cosme_check.analyses x where x.user_id = b.uid order by x.created_at desc limit 1) la on true
  cross join lateral (
    select count(*)::int as n,
           count(*) filter (where ri.kind = 'routine' and ri.time_of_day in ('evening', 'both'))::int as n_soir,
           (array_agg(coalesce(nullif(btrim(an.product_label), ''), an.name) order by ri.position)
              filter (where ri.kind = 'routine' and ri.time_of_day in ('evening', 'both')))[1] as produit_soir
    from cosme_check.routine_items ri left join cosme_check.analyses an on an.id = ri.analysis_id
    where ri.user_id = b.uid) r
  left join lateral (
    select an.id, coalesce(nullif(btrim(an.product_label), ''), an.name) as label, an.score
    from cosme_check.routine_items ri join cosme_check.analyses an on an.id = ri.analysis_id
    where ri.user_id = b.uid and an.score is not null and an.score < 9
    order by an.score asc limit 1) rf on true
  cross join lateral (select count(*)::int as n from cosme_check.coherence_analyses x where x.user_id = b.uid) c
  cross join lateral (select count(*)::int as n from cosme_check.advisor_conversations x where x.user_id = b.uid) adv
  cross join lateral (select exists (select 1 from cosme_check.routine_goal_coverage g where g.user_id = b.uid) as ok) ge
  left join lateral (
    select x.used from cosme_check.user_credits x
    where x.user_id = b.uid and x.day >= (now() at time zone 'Europe/Paris')::date - 1
    order by x.day desc limit 1) cr on true
  cross join lateral (
    select count(*)::int as n,
           coalesce(jsonb_agg(distinct o.data ->> 'slot') filter (where o.data ? 'slot'), '[]'::jsonb) as slots
    from cosme_check.notification_outbox o
    where o.user_id = b.uid and o.status <> 'canceled'
      and o.created_at >= ((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris') st
$fn$;

-- 2. Gabarits : {question_id} et {faible_analysis_id} -------------------------
create or replace function cosme_check.notif_render(p_tpl text, f jsonb)
returns text language sql stable as $fn$
  select case when s is null or btrim(s) = '' then null
              else upper(left(btrim(s), 1)) || substr(btrim(s), 2) end
  from (
    select regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
        p_tpl,
        '{p}', coalesce((f ->> 'prenom') || ', ', '')),
        '{prenom}', coalesce(f ->> 'prenom', '')),
        '{produit}', coalesce(cosme_check.notif_short(f ->> 'last_label'), 'ton dernier produit')),
        '{note}', coalesce(cosme_check.notif_score(f ->> 'last_score'), '?')),
        '{nb_analyses}', coalesce(f ->> 'n_analyses', '0')),
        '{analyses_txt}', case when (f ->> 'n_analyses')::int = 1 then '1 produit' else coalesce(f ->> 'n_analyses', '0') || ' produits' end),
        '{produits_routine}', case when (f ->> 'n_routine')::int = 1 then '1 produit' else coalesce(f ->> 'n_routine', '0') || ' produits' end),
        '{produit_faible}', coalesce(cosme_check.notif_short(f ->> 'faible_label'), 'un produit')),
        '{note_faible}', coalesce(cosme_check.notif_score(f ->> 'faible_score'), '?')),
        '{produit_soir}', coalesce(cosme_check.notif_short(f ->> 'produit_soir'), 'tes soins')),
        '{autres_soir}', case when (f ->> 'n_soir')::int = 2 then ' et 1 autre soin'
                              when (f ->> 'n_soir')::int > 2 then ' et ' || ((f ->> 'n_soir')::int - 1) || ' autres soins' else '' end),
        '{credits}', coalesce(f ->> 'credits', '5')),
        '{question}', coalesce(left(f ->> 'question', 170), '')),
        '{question_id}', coalesce(f ->> 'question_id', '')),
        '{ingredient}', coalesce(f ->> 'ingredient', '')),
        '{ingredient_slug}', coalesce(f ->> 'ingredient_slug', '')),
        '{last_analysis_id}', coalesce(f ->> 'last_analysis_id', '')),
        '{faible_analysis_id}', coalesce(f ->> 'faible_analysis_id', '')),
      '\s{2,}', ' ', 'g') as s
  ) q
$fn$;

-- 3. Planner : expose l'id de la question du jour ------------------------------
create or replace function public.cosme_check_run_notif_planner_v2(p_slot text, p_dry_run boolean default true)
returns jsonb
language plpgsql security definer set search_path to 'cosme_check', 'public' as $fn$
declare
  v_enabled boolean;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_day bigint := floor(extract(epoch from now()) / 86400)::bigint;
  v_quiz text;
  v_quiz_id uuid;
  v_ing_name text;
  v_ing_slug text;
  v_extra jsonb;
  v_queued integer := 0;
  v_summary jsonb;
  v_sample jsonb;
begin
  if p_slot is null or p_slot not in ('matin', 'midi', 'soir') then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;
  select notif_planner_enabled into v_enabled from cosme_check.app_config where id = 1;
  if not p_dry_run and coalesce(v_enabled, false) = false then
    return jsonb_build_object('ok', false, 'error', 'planner_disabled');
  end if;

  -- Quiz du jour : rotation sur les questions serveur. Le tap ouvre /quiz/<id>,
  -- qui affiche CETTE question (l'app mélange aussi des questions embarquées).
  select d.question, d.id into v_quiz, v_quiz_id from (
    select question, id, (row_number() over (order by order_index, id) - 1) as pos, count(*) over () as n
    from cosme_check.daily_picks) d
  where d.pos = ((v_day % greatest(1, ceil(d.n / 10.0))::bigint) * 10) % d.n;

  -- Ingrédient du jour : rotation sur les 300 plus fréquents ayant une fiche.
  select i.name, i.slug into v_ing_name, v_ing_slug from (
    select t.name, t.slug, (row_number() over (order by t.prevalence_pct desc nulls last, t.slug) - 1) as pos, count(*) over () as n
    from (select name, slug, prevalence_pct from cosme_check.ingredients
          where slug is not null and description is not null and length(description) > 120
          order by prevalence_pct desc nulls last, slug limit 300) t) i
  where i.pos = v_day % i.n;

  v_extra := jsonb_build_object('question', v_quiz, 'question_id', v_quiz_id,
                                'ingredient', initcap(lower(v_ing_name)), 'ingredient_slug', v_ing_slug);

  create temp table if not exists _notif_plan (uid uuid, scenario text, title text, body text, deeplink text) on commit drop;
  delete from _notif_plan where true;

  insert into _notif_plan (uid, scenario, title, body, deeplink)
  with facts as (
    select f.uid, f.facts || v_extra as f from cosme_check.notif_user_facts() f
  ), elig as (
    select fa.uid, fa.f, s.key, s.priority, s.fallback, s.deeplink, s.variants
    from facts fa
    join cosme_check.notification_scenarios s on s.enabled and s.slot = p_slot and jsonb_array_length(s.variants) > 0
    where (fa.f ->> 'sent_today')::int < 3
      and not ((fa.f -> 'slots_today') ? p_slot)
      and cosme_check.notif_segment_match(s.segment, fa.f)
      and not exists (
        select 1 from cosme_check.notification_outbox o
        where o.user_id = fa.uid and o.scenario = s.key and o.status <> 'canceled'
          and o.created_at > now() - make_interval(days => greatest(s.cooldown_days, 1)) + interval '3 hours')
  ), pick as (
    select distinct on (uid) * from elig
    order by uid, fallback asc, priority asc, (hashtext(uid::text || key || v_today::text)::bigint & 2147483647)
  )
  select p.uid, p.key,
         cosme_check.notif_render(v ->> 'title', p.f),
         cosme_check.notif_render(v ->> 'body', p.f),
         cosme_check.notif_render(p.deeplink, p.f)
  from pick p
  cross join lateral (
    select p.variants -> ((hashtext(p.uid::text || v_today::text || p.key)::bigint & 2147483647) % jsonb_array_length(p.variants))::int as v) vv;

  delete from _notif_plan where title is null or body is null;

  if not p_dry_run then
    with ins as (
      insert into cosme_check.notification_outbox (user_id, scenario, title, body, deeplink, data, scheduled_at, dedup_key, created_by)
      select uid, scenario, title, body, deeplink, jsonb_build_object('slot', p_slot, 'scenario', scenario), now(),
             scenario || ':' || uid::text || ':' || v_today::text, 'planner_v2'
      from _notif_plan
      on conflict (dedup_key) where dedup_key is not null do nothing
      returning 1)
    select count(*) into v_queued from ins;
  end if;

  select coalesce(jsonb_object_agg(scenario, n), '{}'::jsonb) into v_summary
  from (select scenario, count(*) as n from _notif_plan group by scenario) x;
  select coalesce(jsonb_agg(jsonb_build_object('user', left(uid::text, 8), 'scenario', scenario, 'title', title, 'body', body, 'deeplink', deeplink)), '[]'::jsonb)
    into v_sample from (select * from _notif_plan order by scenario limit 60) y;

  return jsonb_build_object('ok', true, 'dry_run', p_dry_run, 'slot', p_slot, 'day', v_today,
                            'planned', (select count(*) from _notif_plan), 'queued', v_queued,
                            'by_scenario', v_summary, 'sample', case when p_dry_run then v_sample else '[]'::jsonb end);
end;
$fn$;

-- 4. Destinations des scénarios -------------------------------------------------
update cosme_check.notification_scenarios set deeplink = '/quiz/{question_id}', updated_at = now()
 where key = 'quiz_du_jour';
update cosme_check.notification_scenarios set deeplink = '/(tabs)/scan?mode=barcode', updated_at = now()
 where key in ('onboarding_no_scan', 'first_scan_next_step', 'winback_7d', 'winback_14d',
               'reactivation_30d', 'reactivation_60d', 'reactivation_90d', 'credits_unused', 'seasonal_spf');
update cosme_check.notification_scenarios set deeplink = '/analyse/{faible_analysis_id}', updated_at = now()
 where key = 'routine_weak_product';
