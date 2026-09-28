-- ════════════════════════════════════════════════════════════════════════════
-- Alignement note catalogue, factorisé (28 sept 2026, suite de
-- 20260928_unify_product_score_engine.sql).
--
-- La logique du trigger `trg_align_catalog_from_analysis` devient une fonction
-- `f_align_catalog_from_items(ean, items)`, réutilisée par :
--   - le trigger (écriture d'une analyse produit) ;
--   - la RPC `cosme_check_align_catalog_score(ean)`, appelée par l'edge
--     `analyser` quand il sert une fiche depuis le cache et que la note du
--     catalogue n'est pas encore alignée sur ces ingrédients (lignes écrites
--     avant le trigger). Réservée au rôle service : elle écrit le catalogue.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function cosme_check.f_align_catalog_from_items(p_ean text, p_items jsonb)
returns void
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
  select * into st from cosme_check.f_items_color_stats(p_items);
  v_ref := cosme_check.f_reference_score(p_items);

  select c.score, c.count_orange, c.count_rouge into v_cat, v_o, v_r
  from cosme_check.catalog c where c.ean = p_ean;
  v_found := found;

  if v_found and v_cat is not null and v_ref is not null then
    update cosme_check.catalog c set
      score        = v_ref::real,
      score_label  = cosme_check.f_score_label(v_ref::real),
      score_tone   = cosme_check.f_score_tone(v_ref::real),
      count_orange = st.n_orange,
      count_rouge  = st.n_rouge
    where c.ean = p_ean
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
  values (p_ean, v_cat, coalesce(v_o, 0), coalesce(v_r, 0), v_cat,
          cosme_check.f_score_label(v_cat), cosme_check.f_score_tone(v_cat), 'engine_v2', now())
  on conflict (ean) do update set
    base_score = excluded.base_score, count_orange = excluded.count_orange,
    count_rouge = excluded.count_rouge, score_capped = excluded.score_capped,
    score_label = excluded.score_label, score_tone = excluded.score_tone,
    algo_version = excluded.algo_version, computed_at = excluded.computed_at;
end
$fn$;

create or replace function cosme_check.trg_align_catalog_from_analysis()
returns trigger
language plpgsql
security definer
set search_path to 'cosme_check', 'public'
as $fn$
begin
  perform cosme_check.f_align_catalog_from_items(NEW.ean, NEW.result_json->'items');
  return NEW;
end
$fn$;

create or replace function public.cosme_check_align_catalog_score(p_ean text)
returns void
language plpgsql
security definer
set search_path to 'cosme_check', 'public'
as $fn$
declare
  v_items jsonb;
begin
  select pa.result_json->'items' into v_items
  from cosme_check.product_analyses pa where pa.ean = p_ean;
  if found then
    perform cosme_check.f_align_catalog_from_items(p_ean, v_items);
  end if;
end
$fn$;

revoke all on function public.cosme_check_align_catalog_score(text) from public, anon, authenticated;
grant execute on function public.cosme_check_align_catalog_score(text) to service_role;
revoke all on function cosme_check.f_align_catalog_from_items(text, jsonb) from public, anon, authenticated;
