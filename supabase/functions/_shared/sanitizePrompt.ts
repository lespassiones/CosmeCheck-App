/**
 * sanitizePromptValue — neutralise les champs texte libres fournis par
 * l'utilisateur AVANT injection dans un prompt LLM (anti prompt-injection).
 *
 * Stratégie conservatrice : remplace les caractères de contrôle (dont sauts de
 * ligne / tabulations — vecteur classique « \n ignore previous instructions »)
 * par une espace, retire les backticks / fences markdown, compacte les espaces,
 * trim et borne la longueur. Ne déforme pas un nom de produit normal.
 *
 * Module PUR → testable en Jest. (Filtrage par code de caractère pour éviter
 * tout caractère de contrôle littéral dans le source.)
 */
export function sanitizePromptValue(input: string, maxLen = 200): string {
  let stripped = ''
  for (const ch of input) {
    const code = ch.charCodeAt(0)
    // Contrôles C0 (< 0x20) + DEL (0x7F) → espace ; backtick → espace.
    stripped += code < 0x20 || code === 0x7f || ch === '`' ? ' ' : ch
  }
  return stripped.replace(/\s{2,}/g, ' ').trim().slice(0, maxLen)
}
