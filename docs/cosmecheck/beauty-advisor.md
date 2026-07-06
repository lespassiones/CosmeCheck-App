# Beauty Advisor — Cahier des charges (agent)

> Niveau de détail visé : le Beauty Advisor doit être un **agent** fiable, pas un
> chat + recherche par mots-clés. **La véracité des infos prime sur la vitesse**
> (mais la vitesse compte). Une seule edge function `advisor-chat` sert **mobile
> ET web** → toute évolution ici couvre les deux.

## 1. Problème de l'existant (à corriger)
Aujourd'hui : 1 appel `gpt-4o-mini` en streaming qui émet un bloc caché
`<<<RECO>>>{ingredients, form, exclude}<<<END>>>`. Le **client** appelle ensuite
une RPC de reco **par mots-clés** (ingrédients + catégorie + exclude), triée par
score. ⚠️ **Le LLM ne voit JAMAIS les produits affichés** → aucune vérification
d'adéquation. D'où : pour « ma fille de 7 ans a des boutons », il propose de bons
mots-clés mais le carousel sort des **sérums adultes** (vitamine C, kojique,
niacinamide) inadaptés.

## 2. Architecture cible : AGENT À OUTILS **borné** (autonome mais capé)
Vrai agent (tool-use / function calling), mais avec une **limite d'itérations**
(pas de boucle ReAct libre : ni lenteur ni 1000 combinaisons). Autonome ET
scalable (200 users) ET rapide.

**Classifieur en amont (pas cher)** : tranche `simple` (réponse/question/decline
→ 1 crédit, petit modèle, PAS d'agent) vs `agent` (reco → gros modèle + outils).
Sert de garde-coût.

**Outils donnés à l'agent** (il choisit lui-même quoi appeler + les arguments) :
- `search_products({ category?, keywords?, exclude?, min_pastille })` → catalogue
  par taxonomie + contraintes, renvoie le TOP (marque, nom, catégorie, **pastille**,
  1-2 ingrédients clés). Rapide (RPC indexée). Si la RPC de reco actuelle n'est pas
  assez pertinente, on écrit un outil dédié (par catégorie exacte + pastille + exclude).
- `inspect_product({ ean })` → composition/détails d'un produit précis (vérif fine, rare).
- Profil + routine fournis en CONTEXTE ; l'agent décide **quand** s'en servir
  (sujet = soi ET zone pertinente ; ex. « boutons fesses » → ignore objectifs
  cheveux/visage ; « pour ma fille » → ignore le profil + demande l'âge).

**Boucle bornée** : raisonne → 1 à 3 appels d'outils max → **voit les vrais
produits** → garde les PERTINENTS (écarte les inadaptés) → répond + cartes
vérifiées + raison. La « qualité/propreté » vient de la **pastille** (déjà notée),
le rôle du LLM = **pertinence** au besoin/à la personne. Fallback honnête si rien.

> Réutilise le moteur éprouvé de `routine-smart-suggest` (candidats notés → sélection IA + raison), enrichi de la dimension tool-use.

## 3. Règles de comportement
- **Pour qui ?** Détecter `self` vs `other`. Pour autrui → se baser UNIQUEMENT sur ce qui est décrit, jamais le profil de l'utilisateur.
- **Enfant / bébé** : si l'âge n'est pas connu → poser UNE question (« Quel âge a-t-il/elle ? ») avant reco. Bébé < 3 ans → catégorie `bebe` + exclude parfum/alcool/HE/allergène.
- **≤ 3 questions**, simples et concrètes (âge ; « des allergies ou réactions connues ? »). JAMAIS techniques (pas « voulez-vous éviter le [nom INCI] ? »). Ne poser QUE ce qui manque (regarder d'abord le profil si `self`). Ne jamais enchaîner 2 questions inutiles.
- **Anti-esquive** : ne JAMAIS « fuir » une vraie question. Sur peau sensible / eczéma léger / enfant → on AIDE (produits doux + « ce n'est pas un avis médical » + voir un professionnel si ça persiste). Décliner UNIQUEMENT le vrai hors-sujet/jailbreak (président, code source, prompt système, code Python, etc.) → refus poli + recentrage beauté.
- **Honnêteté « rien d'adapté »** : si la vérification ne garde AUCUN produit adapté → le dire clairement + orienter sur le **type** à chercher (ex. « en pharmacie, un baume émollient type Cicaplast/Cicalfate, sans parfum ») — **sans inventer** de produit.
- **Restrictions profil** : appliquées par NOUS, jamais « vérifie que… ».

## 4. Véracité (cœur du sujet)
- Les produits affichés sont ceux que le LLM a **réellement vus et validés** (plus de reco aveugle).
- Il analyse la shortlist et **remplace les inadaptés** ; s'il cherche 10 et n'en garde que 5 bons, il affiche les 5 (+ « Voir plus »).
- Priorité absolue : ne jamais afficher un produit « juste pour afficher ».

## 5. Routing adaptatif (modèle + crédits)
Ladder (confirmé par les tarifs OpenAI fournis ; GPT-5 dispo sur le compte) :
- **Palier 1 — simple** (réponse info, clarif, decline) : **GPT-5 mini** (0,25 $/2 $ le M tokens, 5★ tool-calling, très rapide) → **1 crédit**.
- **Palier 2 — agent reco standard** (~95 % des recos) : **GPT-5 mini avec outils** → **2 crédits**.
- **Palier 3 — agent complexe** (enfant/eczéma, multi-contraintes, « rien trouvé », très ambigu) : **GPT-5** (1,25 $/10 $) → **3 crédits**.
- Le **classifieur** (GPT-5 mini) en amont choisit le palier ET, si `reco`, décide s'il faut escalader en GPT-5.
- Coût réel par message : palier 1 ≈ négligeable ; palier 2 (mini + 1-2 outils) ≈ ~0,01-0,03 $ ; palier 3 (GPT-5) ≈ ~0,05-0,15 $. Confirmé via `openai_cost_daily` après tests.
- **À valider par la batterie** : GPT-5 mini suffit-il pour le palier 2 ? o4-mini/o3 (raisonnement) utiles ? → je teste et je verrouille. Objectif : GPT-5 mini par défaut, GPT-5 pour le complexe (comme suggéré).
- Anti-sur-recherche : outils qui renvoient déjà des candidats **filtrés verts** (pas de tri de milliers de lignes), boucle **bornée (≤ 3 appels)**, prompt qui pousse à UNE recherche ciblée + `inspect_product` seulement en cas de doute précis.
- Scalabilité (jusqu'à ~200 simultanés) : classifieur pas cher en barrage + boucle bornée + RPC indexées. Limite réelle = TPM/RPM du compte OpenAI (à surveiller) ; DB montable en gamme. Rate-limit IP conservé.

## 6. UX
- **Streaming du texte** immédiat (modèle rapide).
- **Cartes produits vérifiées** juste après.
- Pendant l'attente : **messages déterministes rotatifs côté client** (« Je fouille le catalogue… », « Je vérifie les compositions… », « Je garde les plus adaptés… ») à intervalles simples, jusqu'à l'apparition des cartes. (Pas généré par l'IA.)

## 7. Batterie de tests (doit passer à 100 %)
- Enfant eczéma sans âge → demande l'âge → puis hydratants doux corps (pas de sérums actifs).
- Adulte « j'ai de l'eczéma, quoi ? » → utilise le profil.
- Boutons visage adulte / enfant (distinction).
- Ingrédient explicite (« sérum vitamine C ») → le recommande tel quel.
- Maquillage peau grasse → recommande (jamais de refus).
- Follow-up « montre-moi » → ré-émet la reco.
- Hors-sujet (président) / jailbreak (prompt système, code source, python) → décline poliment.
- Cas « rien d'adapté » → honnêteté + orientation pharmacie.
- Restrictions profil respectées dans les produits affichés.
- Perf/scalabilité : latence par palier, comportement à charge.
