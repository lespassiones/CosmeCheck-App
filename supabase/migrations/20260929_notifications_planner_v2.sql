-- notifications_planner_v2 (29 sept 2026)
--
-- Remplace le planner hebdomadaire v1 (1 scénario par personne et par semaine
-- ISO, le plus prioritaire bloquant tous les autres) par un planner QUOTIDIEN :
--   * 3 créneaux : matin (garanti), midi et soir (seulement si un scénario
--     pertinent existe) => 1 à 3 notifications par jour et par personne ;
--   * délai de repos PAR scénario (cooldown_days) au lieu de la semaine ISO ;
--   * textes personnalisés (prénom, produit, note, routine…) via des gabarits ;
--   * contenu quotidien de secours (quiz du jour = même question que l'app,
--     ingrédient du jour) pour garantir le minimum d'une notification ;
--   * respect du bouton « Notifications » du profil
--     (preferences.notifications.enabled = false => aucun envoi).
-- Consigne produit (Brian, 29/09/2026) : minimum 1 par jour, maximum 3.
-- Heures : crons en UTC calés pour Paris (09:30 / 13:00 / 19:30 en été),
-- juste avant le passage du dispatcher (toutes les 15 min).

set statement_timeout = '60s';

-- 1. Colonnes de planification par scénario ---------------------------------
alter table cosme_check.notification_scenarios
  add column if not exists slot text not null default 'matin',
  add column if not exists cooldown_days integer not null default 7,
  add column if not exists fallback boolean not null default false;

do $$ begin
  alter table cosme_check.notification_scenarios
    add constraint notification_scenarios_slot_chk check (slot in ('matin', 'midi', 'soir'));
exception when duplicate_object then null; end $$;

-- 2. Helpers de rendu --------------------------------------------------------
-- Nom de produit court : avant « - », 34 caractères max coupés au mot.
create or replace function cosme_check.notif_short(p text, p_max integer default 34)
returns text language sql immutable as $fn$
  select case when p is null or btrim(p) = '' then null else (
    select case when length(s) <= p_max then s
                else rtrim(regexp_replace(left(s, p_max), '\s+\S*$', ''), ' ,.;:-') || '…' end
    from (select btrim(regexp_replace(split_part(split_part(p, ' - ', 1), ' – ', 1), '\s+', ' ', 'g'), ' ,.;:') as s) q
  ) end
$fn$;

-- Note /20 à la française : 11.8 -> « 11,8 », 20.0 -> « 20 ».
create or replace function cosme_check.notif_score(p text)
returns text language sql immutable as $fn$
  select case when p is null or p = '' then null
              else replace(regexp_replace(to_char(round(p::numeric, 1), 'FM990.0'), '\.0$', ''), '.', ',') end
$fn$;

-- 3. Faits par utilisateur joignable (token push + notifications non coupées)
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
    'faible_label', rf.label, 'faible_score', rf.score,
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
    select coalesce(nullif(btrim(an.product_label), ''), an.name) as label, an.score
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

-- 4. Segments -----------------------------------------------------------------
-- Les anciens segments (inactive_Nd = « au moins N jours ») gardent leur sens
-- pour les envois admin ; le planner v2 utilise des TRANCHES exclusives
-- (inactif_7_13…) pour ne pas enchaîner 3 relances différentes.
create or replace function cosme_check.notif_segment_match(p_segment text, f jsonb)
returns boolean language sql stable as $fn$
  select coalesce(case p_segment
    when 'all'            then true
    when 'has_token'      then true
    when 'free'           then f ->> 'tier' = 'free'
    when 'premium'        then f ->> 'tier' = 'premium'
    when 'no_scan'        then (f ->> 'n_analyses')::int = 0
    when 'one_scan'       then (f ->> 'n_analyses')::int = 1 and f ->> 'last_label' is not null
    when 'no_routine'     then (f ->> 'n_analyses')::int > 0 and (f ->> 'n_routine')::int = 0
    when 'routine_thin'   then (f ->> 'n_routine')::int between 1 and 2
    when 'routine_weak_product' then f ->> 'faible_label' is not null
    when 'routine_evening' then (f ->> 'n_soir')::int > 0 and f ->> 'produit_soir' is not null
    when 'no_promesse'    then (f ->> 'n_analyses')::int > 0 and (f ->> 'n_promesses')::int = 0 and f ->> 'last_analysis_id' is not null
    when 'no_advisor'     then (f ->> 'n_analyses')::int > 0 and (f ->> 'n_advisor')::int = 0
    when 'goals_no_eval'  then (f ->> 'n_routine')::int > 0 and not (f ->> 'goal_eval')::boolean
    when 'power_user_free' then f ->> 'tier' = 'free' and (f ->> 'n_analyses')::int >= 10
    when 'low_last_score' then (f ->> 'last_score')::numeric < 13 and f ->> 'last_analysis_id' is not null
    when 'bad_score_24h'  then (f ->> 'last_score')::numeric < 9 and (f ->> 'last_at')::timestamptz > now() - interval '24 hours'
    when 'credits_unused' then f ->> 'tier' = 'free' and (f ->> 'n_analyses')::int > 0 and (f ->> 'credits_used_today')::int = 0
    when 'inactive_7d'    then (f ->> 'jours_inactif')::int >= 7
    when 'inactive_14d'   then (f ->> 'jours_inactif')::int >= 14
    when 'inactive_30d'   then (f ->> 'jours_inactif')::int >= 30
    when 'inactive_60d'   then (f ->> 'jours_inactif')::int >= 60
    when 'inactive_90d'   then (f ->> 'jours_inactif')::int >= 90
    when 'inactif_7_13'   then (f ->> 'jours_inactif')::int between 7 and 13
    when 'inactif_14_29'  then (f ->> 'jours_inactif')::int between 14 and 29
    when 'inactif_30_59'  then (f ->> 'jours_inactif')::int between 30 and 59
    when 'inactif_60_89'  then (f ->> 'jours_inactif')::int between 60 and 89
    when 'inactif_90'     then (f ->> 'jours_inactif')::int >= 90
    when 'spf_season'     then extract(month from now() at time zone 'Europe/Paris')::int between 5 and 8
    -- Contenu du jour : quiz les jours pairs, ingrédient les jours impairs
    -- (et chacun remplace l'autre si sa donnée manque : le minimum est garanti).
    when 'quiz_du_jour'   then f ->> 'question' is not null
                               and ((floor(extract(epoch from now()) / 86400)::bigint % 2) = 0 or f ->> 'ingredient' is null)
    when 'ingredient_du_jour' then f ->> 'ingredient' is not null
                               and ((floor(extract(epoch from now()) / 86400)::bigint % 2) = 1 or f ->> 'question' is null)
    else false
  end, false)
$fn$;

-- 5. Rendu d'un gabarit ------------------------------------------------------
-- {p} = « Prénom, » ou rien ; première lettre remise en majuscule après coup.
create or replace function cosme_check.notif_render(p_tpl text, f jsonb)
returns text language sql stable as $fn$
  select case when s is null or btrim(s) = '' then null
              else upper(left(btrim(s), 1)) || substr(btrim(s), 2) end
  from (
    select regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
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
        '{ingredient}', coalesce(f ->> 'ingredient', '')),
        '{ingredient_slug}', coalesce(f ->> 'ingredient_slug', '')),
        '{last_analysis_id}', coalesce(f ->> 'last_analysis_id', '')),
      '\s{2,}', ' ', 'g') as s
  ) q
$fn$;

-- 6. Planner v2 ----------------------------------------------------------------
create or replace function public.cosme_check_run_notif_planner_v2(p_slot text, p_dry_run boolean default true)
returns jsonb
language plpgsql security definer set search_path to 'cosme_check', 'public' as $fn$
declare
  v_enabled boolean;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_day bigint := floor(extract(epoch from now()) / 86400)::bigint;
  v_quiz text;
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

  -- Quiz du jour : MÊME sélection que l'app (lib/dailyPicks/select.ts,
  -- pickTodaysItems) => 1er item du lot du jour (jour UTC depuis l'epoch).
  select d.question into v_quiz from (
    select question, (row_number() over (order by order_index, id) - 1) as pos, count(*) over () as n
    from cosme_check.daily_picks) d
  where d.pos = ((v_day % greatest(1, ceil(d.n / 10.0))::bigint) * 10) % d.n;

  -- Ingrédient du jour : rotation sur les 300 plus fréquents ayant une fiche.
  select i.name, i.slug into v_ing_name, v_ing_slug from (
    select t.name, t.slug, (row_number() over (order by t.prevalence_pct desc nulls last, t.slug) - 1) as pos, count(*) over () as n
    from (select name, slug, prevalence_pct from cosme_check.ingredients
          where slug is not null and description is not null and length(description) > 120
          order by prevalence_pct desc nulls last, slug limit 300) t) i
  where i.pos = v_day % i.n;

  v_extra := jsonb_build_object('question', v_quiz, 'ingredient', initcap(lower(v_ing_name)), 'ingredient_slug', v_ing_slug);

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

-- 7. L'audience admin (écran d'envoi manuel) s'appuie sur les mêmes faits :
--    elle respecte aussi le bouton « Notifications » du profil.
create or replace function public.cosme_check_admin_notif_audience(p_segment text)
returns table (user_id uuid)
language sql stable security definer set search_path to 'cosme_check', 'public' as $fn$
  select f.uid from cosme_check.notif_user_facts() f
  where cosme_check.notif_segment_match(p_segment, f.facts)
$fn$;

-- 8. Droits : serveur uniquement (le schéma cosme_check est exposé par l'API).
revoke all on function cosme_check.notif_user_facts() from public, anon, authenticated;
revoke all on function cosme_check.notif_segment_match(text, jsonb) from public, anon, authenticated;
revoke all on function cosme_check.notif_render(text, jsonb) from public, anon, authenticated;
revoke all on function cosme_check.notif_short(text, integer) from public, anon, authenticated;
revoke all on function cosme_check.notif_score(text) from public, anon, authenticated;
revoke all on function public.cosme_check_run_notif_planner_v2(text, boolean) from public, anon, authenticated;
revoke all on function public.cosme_check_admin_notif_audience(text) from public, anon, authenticated;
grant execute on function public.cosme_check_run_notif_planner_v2(text, boolean) to service_role;
grant execute on function public.cosme_check_admin_notif_audience(text) to service_role;

-- 9. Scénarios (gabarits personnalisés). Upsert : ce fichier fait foi, y compris
--    pour les 11 scénarios ajoutés en prod après le v1 sans migration.
insert into cosme_check.notification_scenarios (key, label, description, segment, slot, priority, cooldown_days, fallback, deeplink, enabled, variants) values
('reactivation_90d', 'Réactivation 90 jours', 'Aucune analyse depuis 90 jours ou plus.', 'inactif_90', 'matin', 5, 14, false, '/(tabs)', true,
 $j$[{"title":"{p}ça fait plus de 3 mois","body":"Tes produits ont sûrement changé. Vérifie en 10 secondes s'ils te conviennent."},
     {"title":"Ta peau a changé depuis ?","body":"{p}refais le point sur tes produits, on s'occupe du reste."}]$j$::jsonb),
('reactivation_60d', 'Réactivation 60 jours', 'Aucune analyse depuis 60 à 89 jours.', 'inactif_60_89', 'matin', 8, 10, false, '/(tabs)', true,
 $j$[{"title":"{p}2 mois sans nouvelles","body":"Ton dernier produit analysé, « {produit} », avait {note}/20. Et les nouveaux ?"},
     {"title":"Tes besoins ont évolué ?","body":"{p}vérifie si tes produits te correspondent encore."}]$j$::jsonb),
('reactivation_30d', 'Réactivation 30 jours', 'Aucune analyse depuis 30 à 59 jours.', 'inactif_30_59', 'matin', 10, 7, false, '/(tabs)', true,
 $j$[{"title":"{p}un mois déjà","body":"Un nouveau produit dans ta salle de bain ? Scanne-le avant de l'adopter."},
     {"title":"Ta routine te va toujours ?","body":"« {produit} » avait {note}/20. Compare-le à tes nouveautés."}]$j$::jsonb),
('winback_14d', 'Relance 14 jours', 'Aucune analyse depuis 14 à 29 jours.', 'inactif_14_29', 'matin', 20, 5, false, '/(tabs)', true,
 $j$[{"title":"{p}deux semaines sans scan","body":"Tu as analysé {analyses_txt}. Le prochain sera peut-être ton meilleur."},
     {"title":"Tes objectifs beauté t'attendent","body":"{p}reprends là où tu en étais : un scan suffit."}]$j$::jsonb),
('winback_7d', 'Relance 7 jours', 'Aucune analyse depuis 7 à 13 jours.', 'inactif_7_13', 'matin', 30, 4, false, '/(tabs)', true,
 $j$[{"title":"Un nouveau produit chez toi ?","body":"{p}découvre sa note et s'il convient à ta peau en 10 secondes."},
     {"title":"Ta salle de bain a changé ?","body":"Scanne tes derniers achats et vois ce qu'ils contiennent vraiment."}]$j$::jsonb),
('routine_weak_product', 'Produit faible dans la routine', 'Un produit de la routine a moins de 9/20.', 'routine_weak_product', 'matin', 35, 5, false, '/(tabs)/routine', true,
 $j$[{"title":"{p}« {produit_faible} » plombe ta routine","body":"Seulement {note_faible}/20. On te propose mieux, même usage."},
     {"title":"Un produit de ta routine est à revoir","body":"« {produit_faible} » : {note_faible}/20. Regarde les alternatives mieux notées."}]$j$::jsonb),
('onboarding_no_scan', 'Premier scan', 'Compte créé mais aucune analyse.', 'no_scan', 'matin', 40, 2, false, '/(tabs)', true,
 $j$[{"title":"{p}ton premier scan t'attend","body":"Scanne le code-barres d'un produit de ta salle de bain : sa note en 10 secondes."},
     {"title":"Que vaut vraiment ta crème ?","body":"{p}découvre ce qu'elle contient et si elle convient à ta peau."},
     {"title":"On décrypte ton premier produit ?","body":"Un scan suffit pour repérer les ingrédients à éviter pour toi."}]$j$::jsonb),
('first_scan_next_step', 'Après le premier scan', 'Une seule analyse.', 'one_scan', 'matin', 45, 3, false, '/(tabs)', true,
 $j$[{"title":"{p}bravo pour ton premier scan","body":"« {produit} » a obtenu {note}/20. Scanne un 2e produit pour comparer."},
     {"title":"Et ton 2e produit ?","body":"Compare-le à « {produit} » et garde le meilleur pour ta peau."}]$j$::jsonb),
('bad_score_alternatives', 'Alternatives au dernier produit', 'Dernier produit analysé sous 13/20.', 'low_last_score', 'matin', 50, 7, false, '/analyse/{last_analysis_id}', true,
 $j$[{"title":"{p}on a trouvé mieux","body":"« {produit} » a {note}/20. Découvre des alternatives mieux notées pour le même usage."},
     {"title":"« {produit} » : {note}/20","body":"{p}des produits plus sains existent pour le même usage. Jette un œil."}]$j$::jsonb),
('promesse_discovery', 'Découverte des promesses', 'A des analyses mais n''a jamais vérifié une promesse.', 'no_promesse', 'matin', 55, 4, false, '/analyse/{last_analysis_id}', true,
 $j$[{"title":"{p}promesse tenue ?","body":"Vérifie si « {produit} » fait vraiment ce que la marque annonce, formule à l'appui."},
     {"title":"Anti-âge, hydratant… vraiment ?","body":"Tu as analysé {analyses_txt} mais jamais vérifié une promesse. Essaie sur « {produit} »."}]$j$::jsonb),
('routine_empty', 'Routine vide', 'A des analyses mais aucune routine.', 'no_routine', 'matin', 60, 4, false, '/(tabs)/routine', true,
 $j$[{"title":"{p}et si tu créais ta routine ?","body":"Ajoute « {produit} » et tes autres produits : on repère les incompatibilités."},
     {"title":"Tes produits, au même endroit","body":"Crée ta routine et vois si elle colle à tes objectifs."}]$j$::jsonb),
('routine_thin', 'Routine à compléter', 'Routine de 1 ou 2 produits.', 'routine_thin', 'matin', 65, 5, false, '/(tabs)/routine', true,
 $j$[{"title":"{p}ta routine prend forme","body":"Elle compte {produits_routine}. Ajoute les autres pour un bilan complet."},
     {"title":"Presque complète !","body":"Ajoute tes autres produits pour savoir si ta routine te mène à tes objectifs."}]$j$::jsonb),
('advisor_discovery', 'Découverte du Beauty Advisor', 'A des analyses mais n''a jamais parlé à l''advisor.', 'no_advisor', 'matin', 70, 6, false, '/advisor', true,
 $j$[{"title":"{p}une question beauté ?","body":"Le Beauty Advisor connaît ta peau et ta routine. Demande-lui un conseil personnalisé."},
     {"title":"Besoin d'un conseil ?","body":"Demande au Beauty Advisor quel produit choisir pour ta peau, il répond en quelques secondes."}]$j$::jsonb),
('goals_progress', 'Objectifs beauté', 'A une routine mais pas d''évaluation des objectifs.', 'goals_no_eval', 'matin', 75, 7, false, '/(tabs)/routine', true,
 $j$[{"title":"{p}où en sont tes objectifs ?","body":"Découvre si ta routine couvre vraiment tes objectifs beauté."},
     {"title":"Ta routine te mène-t-elle au but ?","body":"Mesure en un instant si tes produits servent tes objectifs."}]$j$::jsonb),
('power_user_upsell', 'Premium (gros utilisateur gratuit)', 'Gratuit avec 10 analyses ou plus.', 'power_user_free', 'matin', 80, 10, false, '/offre', true,
 $j$[{"title":"{p}{nb_analyses} analyses, bravo !","body":"Passe Premium : 50 analyses par jour au lieu de 5."},
     {"title":"Tu analyses beaucoup","body":"{p}avec Premium, tu as 50 analyses par jour pour tout vérifier."}]$j$::jsonb),
('quiz_du_jour', 'Quiz du jour', 'Contenu quotidien de secours (jours pairs).', 'quiz_du_jour', 'matin', 900, 1, true, '/(tabs)', true,
 $j$[{"title":"Quiz du jour","body":"{question}"},
     {"title":"{p}vrai ou faux ?","body":"{question}"}]$j$::jsonb),
('ingredient_du_jour', 'Ingrédient du jour', 'Contenu quotidien de secours (jours impairs).', 'ingredient_du_jour', 'matin', 901, 1, true, '/ingredient/{ingredient_slug}', true,
 $j$[{"title":"Ingrédient du jour : {ingredient}","body":"À quoi sert-il et faut-il l'éviter ? La réponse en 30 secondes."},
     {"title":"{p}tu connais {ingredient} ?","body":"On te dit ce qu'il fait dans tes cosmétiques et s'il est sûr pour toi."}]$j$::jsonb),
('bad_score_24h', 'Produit mal noté analysé aujourd''hui', 'Analyse de moins de 24 h sous 9/20.', 'bad_score_24h', 'midi', 10, 1, false, '/analyse/{last_analysis_id}', true,
 $j$[{"title":"« {produit} » : {note}/20","body":"{p}pas terrible. Voici des alternatives mieux notées pour le même usage."},
     {"title":"{p}on a trouvé mieux","body":"« {produit} » n'a que {note}/20. Découvre des produits plus sains, même catégorie."}]$j$::jsonb),
('credits_unused', 'Crédits du jour disponibles', 'Gratuit, aucune analyse aujourd''hui.', 'credits_unused', 'midi', 20, 3, false, '/(tabs)', true,
 $j$[{"title":"{p}tes {credits} analyses du jour sont prêtes","body":"Un produit à vérifier avant de l'acheter ? C'est le moment."},
     {"title":"Tes crédits sont rechargés","body":"{credits} analyses gratuites aujourd'hui. Scanne un produit en 10 secondes."}]$j$::jsonb),
('seasonal_spf', 'Solaire (saison)', 'De mai à août.', 'spf_season', 'midi', 30, 14, false, '/(tabs)', true,
 $j$[{"title":"Soleil : es-tu bien protégé ?","body":"{p}vérifie l'indice et la composition de ta crème solaire."},
     {"title":"Ta crème solaire est-elle faite pour toi ?","body":"Scanne-la et découvre ce qu'elle contient vraiment."}]$j$::jsonb),
('routine_soir', 'Routine du soir', 'A des soins du soir dans sa routine.', 'routine_evening', 'soir', 10, 2, false, '/(tabs)/routine', true,
 $j$[{"title":"{p}ta routine du soir","body":"« {produit_soir} »{autres_soir} : 2 minutes pour ta peau avant de dormir."},
     {"title":"C'est l'heure de ta routine","body":"Au programme ce soir : « {produit_soir} »{autres_soir}."}]$j$::jsonb),
('weekly_digest_premium', 'Digest hebdo (premium)', 'Remplacé par le contenu du jour (planner v2).', 'premium', 'matin', 200, 7, false, '/(tabs)', false,
 $j$[{"title":"Ton point beauté de la semaine","body":"Où en es-tu sur tes objectifs ? Fais le point."}]$j$::jsonb),
('weekly_digest_free', 'Digest hebdo (gratuit)', 'Remplacé par le contenu du jour (planner v2).', 'free', 'matin', 210, 7, false, '/(tabs)', false,
 $j$[{"title":"Ta semaine beauté commence","body":"Découvre quels produits sont vraiment faits pour toi."}]$j$::jsonb)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, segment = excluded.segment, slot = excluded.slot,
  priority = excluded.priority, cooldown_days = excluded.cooldown_days, fallback = excluded.fallback,
  deeplink = excluded.deeplink, enabled = excluded.enabled, variants = excluded.variants, updated_at = now();

-- 10. Crons : 3 créneaux (UTC) juste avant le dispatcher (*/15). L'ancien
--     planner hebdomadaire est retiré (sa fonction reste, inutilisée).
do $$ begin perform cron.unschedule('cosme_check_run_notif_planner'); exception when others then null; end $$;
select cron.schedule('cosme_check_notif_matin', '28 7 * * *',  $c$select public.cosme_check_run_notif_planner_v2('matin', false);$c$);
select cron.schedule('cosme_check_notif_midi',  '58 10 * * *', $c$select public.cosme_check_run_notif_planner_v2('midi', false);$c$);
select cron.schedule('cosme_check_notif_soir',  '28 17 * * *', $c$select public.cosme_check_run_notif_planner_v2('soir', false);$c$);
