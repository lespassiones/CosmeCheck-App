/**
 * Écrans de questions du parcours : chaque réponse déclenche une réaction
 * (bulle de Perle, explication, pré-sélection) au lieu d'enchaîner à la chaîne.
 *
 * Règles (28/09/2026) :
 *   - on ne passe JAMAIS seul à l'écran suivant après un choix : c'est la
 *     personne qui appuie sur « Continuer » ;
 *   - la peau du visage et du corps acceptent plusieurs réponses, rangées dans
 *     le profil par `resolveFaceSkin` / `resolveBodySkin` (voir content.ts) ;
 *   - chaque liste entre avec son propre mouvement, pour que deux écrans qui se
 *     suivent ne se ressemblent pas.
 */

import { useEffect, useRef, useState, type FC } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated'
import { fadeUp, softScaleIn } from '@/components/onboarding/flow/motion'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { haptic } from '@/lib/haptics'
import {
  ABANDONED_OPTIONS,
  BODY_EXCLUSIVE,
  BODY_SKIN_OPTIONS,
  CONCERN_OPTIONS,
  FACE_EXCLUSIVE,
  GOAL_SECTIONS,
  HAIR_OPTIONS,
  MOTIVATIONS,
  PAIN_CARDS,
  RESTRICTION_NONE_EXPLAIN,
  RESTRICTION_OPTIONS,
  SKIN_TEST_OPTIONS,
  VOLUME_OPTIONS,
  goalsBubble,
  preselectedGoals,
  resolveBodySkin,
  resolveFaceSkin,
  toggleAnswer,
  type MotivationKey,
  type RestrictionKey,
  type SkinTestAnswer,
} from '@/lib/onboarding/content'
import { searchIngredients, type IngredientSuggestion } from '@/lib/onboarding/productLookup'
import { prettyInci } from '@/lib/onboarding/verdict'
import type { HairConcern, ProfileGoal, SkinConcern } from '@/lib/skin/profile'
import { ConcernIcon } from '@/components/onboarding/flow/icons'
import {
  Cascade,
  Chip,
  Eyebrow,
  Gap,
  Hint,
  OptionCard,
  PerleBubble,
  PrimaryButton,
  StepLayout,
  TextLink,
} from '@/components/onboarding/flow/ui'
import type { StepProps } from '@/components/onboarding/flow/types'

const FACES: Record<SkinTestAnswer, number> = {
  grasse: require('../../../../assets/images/onboarding/face-grasse.webp'),
  mixte: require('../../../../assets/images/onboarding/face-mixte.webp'),
  seche: require('../../../../assets/images/onboarding/face-seche.webp'),
  sensible: require('../../../../assets/images/onboarding/face-sensible.webp'),
  normale: require('../../../../assets/images/onboarding/face-normale.webp'),
  inconnu: require('../../../../assets/images/onboarding/face-inconnu.webp'),
}

const SHELVES = [
  require('../../../../assets/images/onboarding/shelf-1.webp'),
  require('../../../../assets/images/onboarding/shelf-2.webp'),
  require('../../../../assets/images/onboarding/shelf-3.webp'),
  require('../../../../assets/images/onboarding/shelf-4.webp'),
]

/** Espace gardé sous le champ « Autre » des ingrédients, pour ses suggestions. */
const SUGGESTIONS_SPACE = 300

function toggle<T>(list: readonly T[], key: T): T[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
}

/** Champ libre « Autre », ouvert à la demande. */
const OtherInput: FC<{
  value: string | undefined
  placeholder: string
  onChange: (t: string) => void
  multiline?: boolean
}> = ({ value, placeholder, onChange, multiline = true }) => (
  <Animated.View entering={fadeUp(0, 12, 320)}>
    <TextInput
      value={value ?? ''}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.inkLight}
      style={styles.otherInput}
      multiline={multiline}
      maxLength={300}
      autoFocus
      selectionColor={colors.textSelection}
      accessibilityLabel={placeholder}
    />
  </Animated.View>
)

/** Une bulle de réaction de Perle, qui se pose avec un petit tap haptique. */
const Reaction: FC<{ text: string }> = ({ text }) => {
  useEffect(() => {
    haptic.tick()
  }, [text])
  return (
    <Animated.View key={text} entering={fadeUp(0, 16, 380)} style={styles.reaction}>
      <PerleBubble size={56} highlight>
        {text}
      </PerleBubble>
    </Animated.View>
  )
}

// ── A4 : prénom ──────────────────────────────────────────────────────────

export const NameStep: FC<StepProps> = ({ draft, update, next }) => {
  const [value, setValue] = useState(draft.firstName ?? '')
  const ok = value.trim().length > 0
  const submit = () => {
    if (!ok) return
    update({ firstName: value.trim().slice(0, 40) })
    next()
  }
  return (
    <StepLayout footer={<PrimaryButton label="Continuer" onPress={submit} disabled={!ok} />}>
      <PerleBubble>
        Coucou ! Moi c'est Perle. Je lis les étiquettes que personne ne lit. Et toi, tu t'appelles comment ?
      </PerleBubble>
      <Gap h={22} />
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Ton prénom"
        placeholderTextColor={colors.inkLight}
        style={styles.nameInput}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="done"
        onSubmitEditing={submit}
        maxLength={40}
        selectionColor={colors.textSelection}
        accessibilityLabel="Ton prénom"
      />
    </StepLayout>
  )
}

// ── A5 : ça t'est déjà arrivé ? ──────────────────────────────────────────

export const PainStep: FC<StepProps> = ({ update, next, firstName }) => {
  const [reaction, setReaction] = useState<string | null>(null)
  const react = (yes: boolean) => {
    update({ painAck: yes })
    setReaction(yes ? 'Rassure-toi, ça arrive à presque tout le monde.' : 'Tant mieux ! On vérifie quand même que tout va bien.')
  }
  return (
    <StepLayout
      footer={
        reaction ? (
          <PrimaryButton label="Continuer" onPress={next} />
        ) : (
          <>
            <PrimaryButton label="C'est tout moi" onPress={() => react(true)} />
            <TextLink label="Pas vraiment" onPress={() => react(false)} />
          </>
        )
      }
    >
      <PerleBubble>{`Sois honnête${firstName ? `, ${firstName}` : ''}. Ça t'est déjà arrivé ?`}</PerleBubble>
      <Gap h={18} />
      <Cascade from="right" step={90} style={styles.stack}>
        {PAIN_CARDS.map((c) => (
          <View key={c.title} style={styles.painCard} accessible accessibilityLabel={`${c.title}. ${c.sub}`}>
            <Ionicons name={c.icon} size={26} color={colors.rose} />
            <View style={styles.painTexts}>
              <Text style={styles.painTitle}>{c.title}</Text>
              <Text style={styles.painSub}>{c.sub}</Text>
            </View>
          </View>
        ))}
      </Cascade>
      {/* La réaction de Perle se pose juste sous la dernière carte. */}
      {reaction ? <Reaction text={reaction} /> : null}
    </StepLayout>
  )
}

// ── A6 : ce qui t'amène ──────────────────────────────────────────────────

export const MotivationStep: FC<StepProps> = ({ draft, update, next }) => {
  const selected = draft.motivations
  const pick = (key: MotivationKey) => {
    if (key === 'tout') {
      const all = MOTIVATIONS.map((m) => m.key)
      update({ motivations: selected.includes('tout') ? [] : all })
      return
    }
    update({ motivations: toggle(selected.filter((k) => k !== 'tout'), key) })
  }
  return (
    <StepLayout footer={<PrimaryButton label="Continuer" onPress={next} disabled={selected.length === 0} />}>
      <PerleBubble>Qu'est-ce qui t'amène ici ?</PerleBubble>
      <Gap h={18} />
      <Cascade from="down" step={55} style={styles.stackTight}>
        {MOTIVATIONS.map((m) => (
          <OptionCard key={m.key} label={m.label} multi selected={selected.includes(m.key)} onPress={() => pick(m.key)} />
        ))}
      </Cascade>
      <Hint>Tu peux en choisir plusieurs.</Hint>
    </StepLayout>
  )
}

// ── A7 : petit test ──────────────────────────────────────────────────────

export const SkinTestStep: FC<StepProps> = ({ draft, update, next }) => {
  const [describe, setDescribe] = useState(Boolean(draft.skinOther))
  const choose = (key: SkinTestAnswer) => {
    const list = toggleAnswer(draft.skinTests, key, FACE_EXCLUSIVE)
    const r = resolveFaceSkin(list)
    update({ skinTests: list, skinTest: r.primary ?? undefined, skinSensitive: r.sensitive })
  }
  const ok = draft.skinTests.length > 0 || Boolean(draft.skinOther?.trim())
  return (
    <StepLayout footer={<PrimaryButton label="Continuer" onPress={next} disabled={!ok} />}>
      <Eyebrow>PETIT TEST</Eyebrow>
      <PerleBubble>Vers midi, sans retouche, ta peau du visage ressemble à quoi ?</PerleBubble>
      <Gap h={18} />
      <Cascade from="left" step={60} style={styles.stackTight}>
        {SKIN_TEST_OPTIONS.map((o) => (
          <OptionCard
            key={o.key}
            label={o.label}
            minHeight={72}
            multi
            selected={draft.skinTests.includes(o.key)}
            onPress={() => choose(o.key)}
            left={<Image source={FACES[o.key]} style={styles.face} contentFit="contain" />}
          />
        ))}
      </Cascade>
      <Hint>Tu peux en choisir plusieurs.</Hint>
      {describe ? (
        <>
          <Gap h={12} />
          <OtherInput
            value={draft.skinOther}
            placeholder="Ta peau comme tu la ressens, avec tes mots"
            onChange={(t) => update({ skinOther: t })}
          />
        </>
      ) : (
        <TextLink label="Je préfère la décrire avec mes mots" onPress={() => setDescribe(true)} />
      )}
    </StepLayout>
  )
}

// ── Ajouté : peau du corps ───────────────────────────────────────────────

export const BodySkinStep: FC<StepProps> = ({ draft, update, next, firstName }) => {
  const choose = (key: (typeof BODY_SKIN_OPTIONS)[number]['key']) => {
    const list = toggleAnswer(draft.bodySkins, key, BODY_EXCLUSIVE)
    update({ bodySkins: list, bodySkin: resolveBodySkin(list).primary ?? undefined })
  }
  return (
    <StepLayout footer={<PrimaryButton label="Continuer" onPress={next} disabled={draft.bodySkins.length === 0} />}>
      <Eyebrow>ET TON CORPS ?</Eyebrow>
      <PerleBubble>{`Et la peau de ton corps${firstName ? `, ${firstName}` : ''}, elle est comment ?`}</PerleBubble>
      <Gap h={18} />
      <Cascade from="down" step={60} style={styles.stackTight}>
        {BODY_SKIN_OPTIONS.map((o) => (
          <OptionCard
            key={o.key}
            label={o.label}
            multi
            selected={draft.bodySkins.includes(o.key)}
            onPress={() => choose(o.key)}
          />
        ))}
      </Cascade>
      <Hint>Tu peux en choisir plusieurs. Gel douche, crème, déodorant : je vérifierai aussi ceux-là.</Hint>
    </StepLayout>
  )
}

// ── A9 : ce qui t'embête ─────────────────────────────────────────────────

export const ConcernsStep: FC<StepProps> = ({ draft, update, next, firstName }) => {
  const [other, setOther] = useState(Boolean(draft.otherConcerns))

  // « Chauffe ou rougit » au petit test : on pré-coche « Rougeurs » une seule
  // fois. C'est ce souci que la compatibilité lit comme une sensibilité du
  // visage ; la personne le voit et peut le décocher.
  useEffect(() => {
    if (draft.concernsTouched) return
    const concerns =
      draft.skinSensitive && !draft.concerns.includes('rougeurs') ? [...draft.concerns, 'rougeurs' as const] : draft.concerns
    update({ concerns, concernsTouched: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (key: SkinConcern) => update({ concerns: toggle(draft.concerns, key), concernsNone: false })
  const none = () => update({ concerns: [], concernsNone: !draft.concernsNone })
  const ok = draft.concerns.length > 0 || draft.concernsNone || Boolean(draft.otherConcerns?.trim())
  return (
    <StepLayout footer={<PrimaryButton label="Continuer" onPress={next} disabled={!ok} />}>
      <PerleBubble>{`Et qu'est-ce qui t'embête le plus${firstName ? `, ${firstName}` : ''} ?`}</PerleBubble>
      <Gap h={20} />
      <Cascade from="pop" step={40} style={styles.chips}>
        {[
          ...CONCERN_OPTIONS.map((c) => {
            const on = draft.concerns.includes(c.key)
            return (
              <Chip
                key={c.key}
                label={c.label}
                selected={on}
                onPress={() => pick(c.key)}
                icon={<ConcernIcon name={c.icon} color={on ? colors.roseDeep : colors.ink} />}
              />
            )
          }),
          <Chip
            key="none"
            label="Rien de spécial"
            selected={Boolean(draft.concernsNone)}
            onPress={none}
            icon={<ConcernIcon name="rien" color={draft.concernsNone ? colors.roseDeep : colors.ink} />}
          />,
          other ? null : <Chip key="other" label="+ Autre" dashed onPress={() => setOther(true)} />,
        ]}
      </Cascade>
      {other ? (
        <>
          <Gap h={12} />
          <OtherInput
            value={draft.otherConcerns}
            placeholder="Ce que les cases n'ont pas dit : tiraillements, allergie connue…"
            onChange={(t) => update({ otherConcerns: t })}
          />
        </>
      ) : null}
      <Hint>Tu peux en choisir plusieurs.</Hint>
    </StepLayout>
  )
}

// ── Ajouté : objectifs ───────────────────────────────────────────────────

export const GoalsStep: FC<StepProps> = ({ draft, update, next, firstName }) => {
  const [other, setOther] = useState(Boolean(draft.otherGoals))
  const [preCount] = useState(() => (draft.goalsTouched ? 0 : preselectedGoals(draft.concerns).length))

  // Première arrivée : on coche ce que ses soucis impliquent déjà.
  useEffect(() => {
    if (draft.goalsTouched) return
    const pre = preselectedGoals(draft.concerns)
    const merged = [...new Set([...draft.goals, ...pre])]
    update({ goals: merged, goalsTouched: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (key: ProfileGoal) => update({ goals: toggle(draft.goals, key), goalsTouched: true })
  return (
    <StepLayout footer={<PrimaryButton label="Continuer" onPress={next} />}>
      <Eyebrow>TES OBJECTIFS</Eyebrow>
      <PerleBubble>{goalsBubble(firstName, preCount)}</PerleBubble>
      <Gap h={8} />
      {GOAL_SECTIONS.map((s) => (
        <View key={s.title} style={styles.goalSection}>
          <Text style={styles.sectionLabel}>{s.title}</Text>
          {/* Deux objectifs par ligne : plus compact, plus lisible. */}
          <Cascade from="pop" step={35} style={styles.grid} itemStyle={styles.gridItem}>
            {s.goals.map((g) => (
              <Chip key={g.key} fill label={g.label} selected={draft.goals.includes(g.key)} onPress={() => pick(g.key)} />
            ))}
          </Cascade>
        </View>
      ))}
      <Gap h={16} />
      {other ? (
        <OtherInput
          value={draft.otherGoals}
          placeholder="Ton objectif à toi, en une phrase"
          onChange={(t) => update({ otherGoals: t })}
        />
      ) : (
        <View style={styles.chips}>
          <Chip label="+ Un objectif à moi" dashed onPress={() => setOther(true)} />
        </View>
      )}
      <Hint>Tu pourras les modifier à tout moment.</Hint>
    </StepLayout>
  )
}

// ── A11 : ingrédients à éviter ───────────────────────────────────────────

/**
 * Champ « + Autre » avec suggestions : au fil de la frappe, les ingrédients de
 * la base qui correspondent (y compris par leur nom français) s'affichent ; un
 * tap les ajoute à la liste à éviter. Ce qui reste tapé sans correspondance est
 * gardé tel quel comme précision (allergie, remarque).
 */
const IngredientPicker: FC<{
  text: string
  onText: (t: string) => void
  chosen: readonly { slug: string; name: string }[]
  onAdd: (i: IngredientSuggestion) => void
  onRemove: (slug: string) => void
}> = ({ text, onText, chosen, onAdd, onRemove }) => {
  const [results, setResults] = useState<IngredientSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = text.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    let alive = true
    timer.current = setTimeout(async () => {
      const list = await searchIngredients(q, 6)
      if (!alive) return
      setResults(list)
      setLoading(false)
    }, 250)
    return () => {
      alive = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [text])

  const visible = results.filter((r) => !chosen.some((c) => c.slug === r.slug))

  return (
    <View>
      {chosen.length > 0 ? (
        <View style={styles.chosenRow}>
          {chosen.map((c) => (
            <Animated.View
              key={c.slug}
              entering={softScaleIn(0, 0.85, 240)}
              exiting={FadeOut.duration(150)}
              layout={LinearTransition.duration(220)}
            >
              <Pressable
                onPress={() => {
                  haptic.selection()
                  onRemove(c.slug)
                }}
                accessibilityRole="button"
                accessibilityLabel={`Retirer ${prettyInci(c.name)}`}
                style={styles.chosenChip}
              >
                <Text style={styles.chosenText}>{prettyInci(c.name)}</Text>
                <Ionicons name="close" size={15} color={colors.roseDeep} />
              </Pressable>
            </Animated.View>
          ))}
        </View>
      ) : null}
      <Animated.View entering={fadeUp(0, 12, 320)} style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.inkLight} />
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={onText}
          placeholder="Un ingrédient précis, une allergie…"
          placeholderTextColor={colors.inkLight}
          style={styles.searchInput}
          autoFocus
          autoCorrect={false}
          maxLength={120}
          selectionColor={colors.textSelection}
          accessibilityLabel="Un ingrédient précis, une allergie"
        />
        {loading ? <ActivityIndicator size="small" color={colors.rose} /> : null}
      </Animated.View>
      {visible.length > 0 ? (
        <Cascade key={text.trim().toLowerCase()} from="down" step={35} style={styles.suggestions}>
          {visible.map((r) => (
            <Pressable
              key={r.slug}
              onPress={() => {
                haptic.select()
                onAdd(r)
                inputRef.current?.focus()
              }}
              accessibilityRole="button"
              accessibilityLabel={`Éviter ${prettyInci(r.name)}${r.fr ? `, ${r.fr}` : ''}`}
              style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.roseSoft }]}
            >
              <View style={styles.flex}>
                <Text style={styles.suggestionName} numberOfLines={1}>
                  {prettyInci(r.name)}
                </Text>
                {r.fr ? (
                  <Text style={styles.suggestionFr} numberOfLines={1}>
                    {r.fr}
                  </Text>
                ) : null}
              </View>
              <View style={styles.addDot}>
                <Ionicons name="add" size={18} color={colors.surface} />
              </View>
            </Pressable>
          ))}
        </Cascade>
      ) : text.trim().length >= 2 && !loading ? (
        <Text style={styles.noMatch}>Pas d'ingrédient à ce nom : je le garde comme précision.</Text>
      ) : null}
    </View>
  )
}

export const RestrictionsStep: FC<StepProps> = ({ draft, update, next }) => {
  const [last, setLast] = useState<RestrictionKey | 'none' | null>(
    draft.restrictions.length > 0 ? draft.restrictions[draft.restrictions.length - 1] : null,
  )
  const [other, setOther] = useState(Boolean(draft.allergiesFreeform) || draft.restrictionIngredients.length > 0)
  const pick = (key: RestrictionKey) => {
    const nextList = toggle(draft.restrictions, key)
    update({ restrictions: nextList, restrictionsNone: false })
    setLast(nextList.includes(key) ? key : nextList[nextList.length - 1] ?? null)
  }
  const none = () => {
    update({ restrictions: [], restrictionsNone: !draft.restrictionsNone })
    setLast(draft.restrictionsNone ? null : 'none')
  }
  const explain =
    last === 'none'
      ? { title: 'Aucun', text: RESTRICTION_NONE_EXPLAIN }
      : last
        ? (() => {
            const o = RESTRICTION_OPTIONS.find((r) => r.key === last)!
            return { title: o.label, text: o.explain }
          })()
        : null
  const ok =
    draft.restrictions.length > 0 ||
    draft.restrictionsNone ||
    draft.restrictionIngredients.length > 0 ||
    Boolean(draft.allergiesFreeform?.trim())
  return (
    <StepLayout
      footer={<PrimaryButton label="Continuer" onPress={next} disabled={!ok} />}
      focusSpace={other ? SUGGESTIONS_SPACE : undefined}
    >
      <PerleBubble>Il y a des ingrédients que tu préfères éviter ?</PerleBubble>
      <Gap h={20} />
      <Cascade from="pop" step={45} style={styles.chips}>
        {[
          ...RESTRICTION_OPTIONS.map((r) => (
            <Chip key={r.key} label={r.label} selected={draft.restrictions.includes(r.key)} onPress={() => pick(r.key)} />
          )),
          <Chip key="none" label="Aucun pour l'instant" selected={Boolean(draft.restrictionsNone)} onPress={none} />,
          other ? null : <Chip key="other" label="+ Autre" dashed onPress={() => setOther(true)} />,
        ]}
      </Cascade>
      {explain ? (
        <Animated.View key={explain.title} entering={fadeUp(0, 12, 320)} style={styles.explain}>
          <Ionicons name="bulb-outline" size={20} color={colors.rose} style={styles.explainIcon} />
          <View style={styles.flex}>
            <Text style={styles.explainTitle}>{explain.title}</Text>
            <Text style={styles.explainText}>{explain.text}</Text>
          </View>
        </Animated.View>
      ) : null}
      {other ? (
        <>
          <Gap h={14} />
          <IngredientPicker
            text={draft.allergiesFreeform ?? ''}
            onText={(t) => update({ allergiesFreeform: t })}
            chosen={draft.restrictionIngredients}
            onAdd={(i) =>
              update({
                restrictionIngredients: [...draft.restrictionIngredients, { slug: i.slug, name: i.name }],
                restrictionsNone: false,
                allergiesFreeform: '',
              })
            }
            onRemove={(slug) =>
              update({ restrictionIngredients: draft.restrictionIngredients.filter((i) => i.slug !== slug) })
            }
          />
        </>
      ) : null}
    </StepLayout>
  )
}

// ── A12 : produits par jour ──────────────────────────────────────────────

export const VolumeStep: FC<StepProps> = ({ draft, update, next }) => (
  <StepLayout footer={<PrimaryButton label="Continuer" onPress={next} disabled={!draft.productsPerDay} />}>
    <PerleBubble>
      Sur une journée, tu utilises combien de produits ? Visage, corps, cheveux, maquillage : tout compte.
    </PerleBubble>
    <Gap h={18} />
    <Cascade from="right" step={70} style={styles.stackTight}>
      {VOLUME_OPTIONS.map((o) => (
        <OptionCard
          key={o.value}
          label={o.label}
          minHeight={78}
          selected={draft.productsPerDay === o.value}
          onPress={() => update({ productsPerDay: o.value })}
          left={
            <View style={styles.shelfBadge}>
              <Image source={SHELVES[o.filled - 1]} style={styles.shelf} contentFit="contain" />
            </View>
          }
        />
      ))}
    </Cascade>
  </StepLayout>
)

// ── A14 : ta peau, cobaye ────────────────────────────────────────────────

export const AbandonedStep: FC<StepProps> = ({ draft, update, next }) => {
  const chosen = ABANDONED_OPTIONS.find((o) => o.key === draft.abandoned)
  return (
    <StepLayout footer={<PrimaryButton label="Continuer" onPress={next} disabled={!chosen} />}>
      <PerleBubble>
        Et cette année, combien de produits as-tu arrêtés parce qu'ils ne te convenaient pas ?
      </PerleBubble>
      <Gap h={18} />
      <Cascade from="down" step={60} style={styles.stackTight}>
        {ABANDONED_OPTIONS.map((o) => (
          <OptionCard
            key={o.key}
            label={o.label}
            selected={draft.abandoned === o.key}
            onPress={() => update({ abandoned: o.key })}
          />
        ))}
      </Cascade>
      {chosen ? <Reaction key={chosen.key} text={chosen.reaction} /> : null}
    </StepLayout>
  )
}

// ── A18 : cheveux ────────────────────────────────────────────────────────

export const HairStep: FC<StepProps> = ({ draft, update, next, firstName }) => {
  const pick = (key: HairConcern | 'ok') => {
    if (key === 'ok') {
      update({ hair: [], hairOk: !draft.hairOk })
      return
    }
    update({ hair: toggle(draft.hair, key), hairOk: false })
  }
  const answered = draft.hair.length > 0 || draft.hairOk
  return (
    <StepLayout
      footer={
        <>
          <PrimaryButton label="Continuer" onPress={next} disabled={!answered} />
          <TextLink label="Passer" onPress={next} />
        </>
      }
    >
      <Eyebrow>UNE DERNIÈRE CHOSE</Eyebrow>
      <PerleBubble>{`Et tes cheveux${firstName ? `, ${firstName}` : ''}, ils sont plutôt comment ?`}</PerleBubble>
      <Gap h={20} />
      <Cascade from="pop" step={45} style={styles.chips}>
        {HAIR_OPTIONS.map((h) => (
          <Chip
            key={h.key}
            label={h.label}
            selected={h.key === 'ok' ? Boolean(draft.hairOk) : draft.hair.includes(h.key)}
            onPress={() => pick(h.key)}
          />
        ))}
      </Cascade>
      {answered ? (
        <Animated.View entering={fadeUp(0, 12, 320)} style={styles.noted}>
          <Animated.View entering={softScaleIn(120, 0.6, 240)} style={styles.notedDot}>
            <Ionicons name="checkmark" size={13} color={colors.surface} />
          </Animated.View>
          <Text style={styles.notedText}>
            {draft.hairOk ? 'Parfait. Je garderai un œil sur ton shampoing quand même.' : 'Noté. Ton shampoing aussi passera au crible.'}
          </Text>
        </Animated.View>
      ) : null}
    </StepLayout>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 12 },
  stackTight: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  gridItem: { width: '48.5%' },
  nameInput: {
    height: 60,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.rose,
    backgroundColor: colors.surface,
    paddingHorizontal: 24,
    fontFamily: fontFamilies.regular,
    fontSize: 19,
    color: colors.ink,
  },
  otherInput: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.rose,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  painCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  painTexts: { flex: 1, gap: 3 },
  painTitle: { fontFamily: fontFamilies.semiBold, fontSize: 16.5, lineHeight: 22, color: colors.ink },
  painSub: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 20, color: colors.inkLight },
  face: { width: 48, height: 48 },
  goalSection: { marginTop: 18, gap: 10 },
  sectionLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    letterSpacing: 1.6,
    color: colors.inkLight,
    textAlign: 'center',
  },
  explain: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.roseSoft,
  },
  explainIcon: { marginTop: 1 },
  explainTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.roseDeep, marginBottom: 2 },
  explainText: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 21, color: colors.ink },
  chosenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chosenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.roseSoft,
    borderWidth: 1.5,
    borderColor: colors.rose,
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
  },
  chosenText: { fontFamily: fontFamilies.medium, fontSize: 14.5, color: colors.roseDeep },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.rose,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, fontFamily: fontFamilies.regular, fontSize: 16, color: colors.ink, paddingVertical: 12 },
  suggestions: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  suggestionName: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  suggestionFr: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted, marginTop: 1 },
  addDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noMatch: { fontFamily: fontFamilies.regular, fontSize: 13.5, color: colors.inkMuted, marginTop: 8, textAlign: 'center' },
  shelfBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shelf: { width: 54, height: 24 },
  reaction: { marginTop: 18 },
  noted: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, justifyContent: 'center' },
  notedDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notedText: { fontFamily: fontFamilies.regular, fontSize: 15, color: colors.ink, flexShrink: 1 },
})
