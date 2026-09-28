-- ════════════════════════════════════════════════════════════════════════════
-- NOTE UNIQUE PAR PRODUIT (28 sept 2026, retour bêta Stela)
--
-- Problème : un même produit affichait des notes différentes selon l'écran
-- (carte Alternative « Très bien », fiche 2 étoiles orange). Cause racine : la
-- note catalogue venait de l'ancien outil d'import (autre découpage de l'INCI),
-- alors que la fiche colore les ingrédients avec le moteur de l'app. Sur les
-- 258 936 produits déjà analysés, 3 175 notes catalogue contredisaient les
-- couleurs de leur propre fiche (ex. EAN 11831525 : 17,34 avec MIT + MCI).
--
-- Décision éditeur : la note unique est celle du MOTEUR DE L'APP appliqué aux
-- ingrédients affichés sur la fiche. Le catalogue la porte, tous les écrans la
-- lisent telle quelle. Ce fichier :
--   1. porte le moteur en SQL (f_pastille_score), port exact de
--      analyser/score.ts pastilleTone(gate=false) + synthScore, validé sur
--      258 936 analyses : 0 écart avec le moteur TypeScript ;
--   2. aligne automatiquement le catalogue quand une analyse produit est
--      (re)calculée (trigger sur product_analyses), avec deux gardes : moins de
--      50 % d'ingrédients identifiés = analyse pas assez fiable, le catalogue
--      garde sa note ; une note catalogue NULL (retirée volontairement) n'est
--      jamais remplie ici ;
--   3. propage toute nouvelle note catalogue à l'historique (analyses), au
--      cache par EAN (product_analyses.score), au sidecar et aux Pépites ;
--   4. Pépites : note stockée en réel (elle était arrondie à l'entier : 16,6
--      devenait 17 et affichait un cœur « Très bien » au lieu de 4 étoiles) ;
--   5. le cache par EAN renvoie toujours la note catalogue (chemin rapide des
--      alternatives, qui insère l'analyse sans passer par l'edge) ;
--   6. les alternatives ne proposent que des produits dont la fiche est déjà
--      calculée (note vérifiée par le moteur : la carte == la fiche).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Moteur de note ──────────────────────────────────────────────────────────
-- Port SQL EXACT de supabase/functions/analyser/score.ts : pastilleTone(gate=false) + synthScore.
-- Entrée : le tableau `items` d'un result_json (champs colorRating + position).
-- Sortie : note 0-20 (double precision) ou NULL si aucun ingrédient coloré.
create or replace function cosme_check.f_pastille_score(p_items jsonb)
returns double precision
language plpgsql
immutable
set search_path to 'cosme_check', 'public'
as $fn$
declare
  cols text[];
  n int;
  nv int := 0; nj int := 0; no_ int := 0; nr int := 0;
  corps_max int;
  i int;
  c text;
  w int;
  zone int; -- 1 Tete, 2 Corps, 3 Queue
  ceil_ int := 0;
  cnt_r int := 0; cnt_o int := 0;
  sgood double precision := 0; stot double precision := 0;
  ratio double precision;
  comp int; comp_c int; fin int;
  b double precision; wd double precision;
begin
  select array_agg(col order by pos, ord) into cols
  from (
    select it->>'colorRating' as col,
           coalesce((it->>'position')::double precision, 0) as pos,
           ord
    from jsonb_array_elements(
      case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
    ) with ordinality t(it, ord)
    where it->>'colorRating' in ('Vert', 'Jaune', 'Orange', 'Rouge')
  ) s;

  n := coalesce(array_length(cols, 1), 0);
  if n = 0 then
    return null;
  end if;

  for i in 1..n loop
    c := cols[i];
    if c = 'Vert' then nv := nv + 1;
    elsif c = 'Jaune' then nj := nj + 1;
    elsif c = 'Orange' then no_ := no_ + 1;
    else nr := nr + 1;
    end if;
  end loop;

  if no_ = 0 and nr = 0 then
    -- Branche douce
    if nj > nv then
      b := 9.0; wd := 3.9;            -- caution
    elsif nj = 0 then
      b := 17.0; wd := 3.0;           -- very-safe
    else
      b := 13.0; wd := 3.9;           -- safe
    end if;
  else
    -- Branche sévère
    corps_max := ceil(0.6::double precision * n);
    for i in 1..n loop
      c := cols[i];
      zone := case when i <= 5 then 1 when i <= corps_max then 2 else 3 end;
      w := case zone when 1 then 3 when 2 then 2 else 1 end;
      stot := stot + w;
      if c = 'Vert' then sgood := sgood + w;
      elsif c = 'Jaune' then sgood := sgood + 0.5 * w;
      end if;
      if c = 'Rouge' then
        cnt_r := cnt_r + 1;
        ceil_ := greatest(ceil_, case zone when 1 then 3 when 2 then 2 else 1 end);
      elsif c = 'Orange' then
        cnt_o := cnt_o + 1;
        ceil_ := greatest(ceil_, case when zone = 3 then 0 else 1 end);
      end if;
    end loop;
    if cnt_r >= 2 then ceil_ := greatest(ceil_, 2); end if;
    if cnt_o >= 4 then ceil_ := greatest(ceil_, 2); end if;
    ratio := case when stot > 0 then sgood / stot else 0 end;
    comp := case when ratio >= 0.8 then 0 when ratio >= 0.55 then 1 when ratio >= 0.32 then 2 else 3 end;
    comp_c := case when cnt_r = 0 then least(comp, 2) else comp end;
    fin := greatest(ceil_, comp_c);
    if fin = 3 then
      if cnt_r >= 2 then b := 0.0; wd := 2.0;   -- high-risk
      else b := 0.0; wd := 4.9;                 -- danger
      end if;
    elsif fin = 2 then b := 5.0; wd := 3.9;     -- warning
    elsif fin = 1 then b := 9.0; wd := 3.9;     -- caution
    else b := 13.0; wd := 3.9;                  -- safe (filet)
    end if;
  end if;

  -- synthScore : Math.round((b + w * ratio) * 100) / 100, ratio = (vert + 0.5 jaune) / n
  ratio := (nv + 0.5 * nj)::double precision / n;
  return floor((b + wd * ratio) * 100 + 0.5) / 100;
end
$fn$;

-- Compteurs et taux d'identification d'un tableau d'items.
create or replace function cosme_check.f_items_color_stats(
  p_items jsonb,
  out n_orange int, out n_rouge int, out n_colored int, out n_total int)
language sql
immutable
set search_path to 'cosme_check', 'public'
as $fn$
  select count(*) filter (where it->>'colorRating' = 'Orange')::int,
         count(*) filter (where it->>'colorRating' = 'Rouge')::int,
         count(*) filter (where it->>'colorRating' in ('Vert', 'Jaune', 'Orange', 'Rouge'))::int,
         count(*)::int
  from jsonb_array_elements(
    case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) it
$fn$;

-- Note de référence d'une analyse : le moteur, si au moins 50 % des
-- ingrédients sont identifiés (sinon NULL : pas assez fiable pour faire foi).
-- Même règle que analyser/score.ts referenceScore.
create or replace function cosme_check.f_reference_score(p_items jsonb)
returns double precision
language sql
immutable
set search_path to 'cosme_check', 'public'
as $fn$
  select case
           when s.n_total > 0 and s.n_colored::double precision / s.n_total >= 0.5
             then cosme_check.f_pastille_score(p_items)
         end
  from cosme_check.f_items_color_stats(p_items) s
$fn$;

-- 2. Analyse produit → catalogue + sidecar ──────────────────────────────────
create or replace function cosme_check.trg_align_catalog_from_analysis()
returns trigger
language plpgsql
security definer
set search_path to 'cosme_check', 'public'
as $fn$
declare
  st record;
  v_ref double precision;
  v_cat real;
  v_o int;
  v_r int;
  v_found boolean;
begin
  select * into st from cosme_check.f_items_color_stats(NEW.result_json->'items');
  v_ref := cosme_check.f_reference_score(NEW.result_json->'items');

  select c.score, c.count_orange, c.count_rouge into v_cat, v_o, v_r
  from cosme_check.catalog c where c.ean = NEW.ean;
  v_found := found;

  if v_found and v_cat is not null and v_ref is not null then
    update cosme_check.catalog c set
      score        = v_ref::real,
      score_label  = cosme_check.f_score_label(v_ref::real),
      score_tone   = cosme_check.f_score_tone(v_ref::real),
      count_orange = st.n_orange,
      count_rouge  = st.n_rouge
    where c.ean = NEW.ean
      and (c.score is distinct from v_ref::real
        or c.count_orange is distinct from st.n_orange
        or c.count_rouge is distinct from st.n_rouge
        or c.score_label is distinct from cosme_check.f_score_label(v_ref::real)
        or c.score_tone is distinct from cosme_check.f_score_tone(v_ref::real));
    v_cat := v_ref::real;
    v_o := st.n_orange;
    v_r := st.n_rouge;
  elsif not v_found or v_cat is null then
    -- Hors catalogue ou note retirée : le sidecar reflète l'analyse.
    v_o := st.n_orange;
    v_r := st.n_rouge;
  end if;
  -- Sinon (analyse peu fiable) : le sidecar garde les compteurs DU CATALOGUE,
  -- pour que liste, fiche et aperçu de scan plafonnent à l'identique.

  insert into cosme_check.product_score_cap
    (ean, base_score, count_orange, count_rouge, score_capped, score_label, score_tone, algo_version, computed_at)
  values (NEW.ean, v_cat, coalesce(v_o, 0), coalesce(v_r, 0), v_cat,
          cosme_check.f_score_label(v_cat), cosme_check.f_score_tone(v_cat), 'engine_v2', now())
  on conflict (ean) do update set
    base_score = excluded.base_score, count_orange = excluded.count_orange,
    count_rouge = excluded.count_rouge, score_capped = excluded.score_capped,
    score_label = excluded.score_label, score_tone = excluded.score_tone,
    algo_version = excluded.algo_version, computed_at = excluded.computed_at;
  return NEW;
end
$fn$;

drop trigger if exists sync_score_cap on cosme_check.product_analyses;
drop trigger if exists trg_align_catalog_from_analysis on cosme_check.product_analyses;
create trigger trg_align_catalog_from_analysis
  after insert or update of result_json on cosme_check.product_analyses
  for each row execute function cosme_check.trg_align_catalog_from_analysis();

-- 3. Note catalogue → historique, cache EAN, sidecar, Pépites ────────────────
create index if not exists analyses_ean_idx on cosme_check.analyses (ean) where ean is not null;

create or replace function cosme_check.trg_propagate_catalog_score()
returns trigger
language plpgsql
security definer
set search_path to 'cosme_check', 'public'
as $fn$
declare
  v numeric;
  lab text;
  tone text;
  band_changed boolean;
begin
  if NEW.score is null then
    return NEW;
  end if;
  v := round(NEW.score::numeric, 2);
  lab := cosme_check.f_score_label(NEW.score);
  tone := cosme_check.f_score_tone(NEW.score);
  band_changed := cosme_check.f_score_tone(OLD.score) is distinct from tone;

  -- Historique des utilisateurs. Si la bande change, on retire la
  -- compatibilité stockée (elle dérive de la note) : le client la régénère au
  -- prochain affichage, sans débit (les blocs IA restent en place).
  update cosme_check.analyses a set
    score = v,
    result_json = case
      when jsonb_typeof(a.result_json) = 'object' then
        (case when band_changed then a.result_json - 'compatibility' else a.result_json end)
        || jsonb_build_object('score', v, 'scoreLabel', lab, 'scoreTone', tone)
      else a.result_json
    end
  where a.ean = NEW.ean
    and (a.score is distinct from v or a.result_json->'score' is distinct from to_jsonb(v));

  update cosme_check.product_analyses pa set
    score = NEW.score, score_label = lab, score_tone = tone
  where pa.ean = NEW.ean and pa.score is distinct from NEW.score;

  update cosme_check.product_score_cap sc set
    base_score = NEW.score, score_capped = NEW.score, score_label = lab, score_tone = tone
  where sc.ean = NEW.ean and sc.base_score is distinct from NEW.score;

  update cosme_check.weekly_picks_pool wp set score = NEW.score
  where wp.ean = NEW.ean and wp.score is distinct from NEW.score;
  return NEW;
end
$fn$;

drop trigger if exists trg_propagate_catalog_score on cosme_check.catalog;
create trigger trg_propagate_catalog_score
  after update of score on cosme_check.catalog
  for each row when (OLD.score is distinct from NEW.score)
  execute function cosme_check.trg_propagate_catalog_score();

-- 4. Pépites : note réelle, plus d'arrondi ────────────────────────────────────
alter table cosme_check.weekly_picks_pool alter column score type real using score::real;

create or replace function cosme_check.refresh_weekly_picks_pool()
returns integer
language plpgsql
security definer
set search_path to 'cosme_check', 'public'
as $fn$
declare
  v_count integer;
begin
  delete from cosme_check.weekly_picks_pool;

  insert into cosme_check.weekly_picks_pool
    (need, rank, ean, brand, name, image_url, score, family, subcategory,
     ingredients_text, count_orange, count_rouge, count_total)
  select m.need, p.rank, p.ean, p.brand, p.name, p.image_url, p.score,
         p.family, p.subcategory, p.ingredients_text,
         p.count_orange, p.count_rouge, p.count_total
  from cosme_check.product_intent_mapping m
  cross join lateral (
    select
      cat.ean::text                      as ean,
      cat.brand                          as brand,
      cat.name                           as name,
      cat.image_url                      as image_url,
      cat.score                          as score,
      pc.category                        as family,
      pc.subcategory                     as subcategory,
      cat.ingredients_text               as ingredients_text,
      coalesce(cat.count_orange, 0)::int as count_orange,
      coalesce(cat.count_rouge, 0)::int  as count_rouge,
      coalesce(cat.count_total, 0)::int  as count_total,
      row_number() over (order by cat.score desc, cat.count_total desc nulls last, cat.ean) as rank
    from cosme_check.product_classifications pc
    join cosme_check.catalog cat on cat.ean = pc.ean
    where pc.subcategory = any(m.subcategories)
      and cat.score >= least(greatest(m.min_score_20, 0), 20)
      and cat.is_active = true
      and cat.image_url is not null
      and cat.ingredients_text is not null
      and exists (select 1 from cosme_check.product_analyses pa where pa.ean = cat.ean)
    order by cat.score desc, cat.count_total desc nulls last, cat.ean
    limit 40
  ) p
  where m.active and cardinality(m.subcategories) > 0;

  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

drop function if exists public.cosme_check_weekly_picks_candidates(text[], integer);
create function public.cosme_check_weekly_picks_candidates(p_needs text[], p_per_need integer default 12)
returns table(need text, ean text, brand text, name text, image_url text, score real,
              family text, sub_category text, ingredients_text text,
              count_orange integer, count_rouge integer, count_total integer)
language sql
stable security definer
set search_path to 'cosme_check', 'public'
as $fn$
  select wp.need, wp.ean, wp.brand, wp.name, wp.image_url, wp.score,
         wp.family, wp.subcategory, wp.ingredients_text,
         wp.count_orange, wp.count_rouge, wp.count_total
  from cosme_check.weekly_picks_pool wp
  where wp.need = any(p_needs)
    and wp.rank <= least(greatest(coalesce(p_per_need, 12), 1), 40)
  order by wp.need, wp.rank;
$fn$;
grant execute on function public.cosme_check_weekly_picks_candidates(text[], integer) to anon, authenticated, service_role;

-- 5. Cache par EAN : toujours la note catalogue ──────────────────────────────
create or replace function public.cosme_check_get_product_analysis(p_ean text)
returns jsonb
language sql
stable security definer
set search_path to 'cosme_check', 'public'
as $fn$
  select case
           when c.score is not null and jsonb_typeof(pa.result_json) = 'object' then
             pa.result_json || jsonb_build_object(
               'score', round(c.score::numeric, 2),
               'scoreLabel', cosme_check.f_score_label(c.score),
               'scoreTone', cosme_check.f_score_tone(c.score))
           else pa.result_json
         end
  from cosme_check.product_analyses pa
  left join cosme_check.catalog c on c.ean = pa.ean
  where pa.ean = p_ean
  limit 1;
$fn$;

-- 6. Alternatives : uniquement des produits à note vérifiée ───────────────────
create or replace function public.cosme_check_alternatives_by_category_prefix(p_prefix text, p_limit integer default 50, p_offset integer default 0)
returns table(ean text, brand text, name text, category text, image_url text, score double precision,
              score_label text, score_tone text, count_total integer, ingredients_text text,
              count_orange integer, count_rouge integer)
language sql
stable security definer
set search_path to 'public', 'cosme_check'
set statement_timeout to '15000'
as $fn$
  select cand.ean, cand.brand, cand.name, cand.category, cand.image_url, cand.score,
    cand.score_label, cand.score_tone, cand.count_total, cand.ingredients_text,
    coalesce(sc.count_orange, 0), coalesce(sc.count_rouge, 0)
  from (
    select c.ean, c.brand, c.name, c.category, c.image_url,
      c.score::double precision as score, c.score_label, c.score_tone,
      c.count_total::int as count_total, c.ingredients_text
    from cosme_check.catalog c
    where c.is_active
      and c.category like p_prefix
      and c.count_total >= 5
      and c.score is not null
      and c.ingredients_text is not null
      and exists (select 1 from cosme_check.product_analyses pa where pa.ean = c.ean)
    order by c.score desc, c.ean
    limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ) cand
  left join cosme_check.product_score_cap sc on sc.ean = cand.ean
  order by cand.score desc, cand.ean
$fn$;

create or replace function public.cosme_check_alternatives_by_category_exact(p_category text, p_limit integer default 30, p_offset integer default 0)
returns table(ean text, brand text, name text, category text, image_url text, score double precision,
              score_label text, score_tone text, count_total integer, ingredients_text text,
              count_orange integer, count_rouge integer)
language sql
stable security definer
set search_path to 'public', 'cosme_check'
set statement_timeout to '15000'
as $fn$
  select cand.ean, cand.brand, cand.name, cand.category, cand.image_url, cand.score,
    cand.score_label, cand.score_tone, cand.count_total, cand.ingredients_text,
    coalesce(sc.count_orange, 0), coalesce(sc.count_rouge, 0)
  from (
    select c.ean, c.brand, c.name, c.category, c.image_url,
      c.score::double precision as score, c.score_label, c.score_tone,
      c.count_total::int as count_total, c.ingredients_text
    from cosme_check.catalog c
    where c.is_active
      and c.category = p_category
      and c.count_total >= 5
      and c.score is not null
      and c.ingredients_text is not null
      and exists (select 1 from cosme_check.product_analyses pa where pa.ean = c.ean)
    order by c.score desc, c.ean
    limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ) cand
  left join cosme_check.product_score_cap sc on sc.ean = cand.ean
  order by cand.score desc, cand.ean
$fn$;
