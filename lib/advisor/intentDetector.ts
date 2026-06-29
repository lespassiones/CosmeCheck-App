/**
 * Intent Detector — Detecte les besoins de l'utilisateur du Beauty Advisor
 *
 * Utilise GPT-4o-mini (200 tokens max) pour classifier un message utilisateur
 * en ProductIntent avec need, body_zone, concern, et confidence.
 */

import { Anthropic } from '@anthropic-ai/sdk';

export interface ProductIntent {
  intent: 'recommendation' | 'question' | 'comparison' | 'unknown';
  need: string;
  body_zone: string | null;
  concern: string | null;
  confidence: number; // 0-1
  raw_message: string;
  detected_at: Date;
}

const INTENT_SYSTEM_PROMPT = `Tu es un analyseur de besoins cosmétiques. Classe le message utilisateur en intent.

Retourne un JSON strict (no markdown):
{
  "intent": "recommendation" | "question" | "comparison" | "unknown",
  "need": "e.g. 'hydration_face', 'odor_control_feet', 'anti_aging'",
  "body_zone": "e.g. 'face', 'feet', 'hair', 'lips', 'eyes', 'hands', 'body', 'scalp', 'legs'",
  "concern": "e.g. 'dryness', 'sensitivity', 'aging', 'acne', 'odor'",
  "confidence": 0.0-1.0,
  "reasoning": "why this classification"
}

Exemples:
- "Je pue des pieds" → {intent: "recommendation", need: "odor_control_feet", body_zone: "feet", concern: "odor", confidence: 0.95}
- "Hydrate moi le visage sensible" → {intent: "recommendation", need: "hydration_face", body_zone: "face", concern: "sensitivity", confidence: 0.9}
- "C'est quoi un retinol?" → {intent: "question", need: null, body_zone: null, concern: null, confidence: 0.8}
- "Je suis allergique aux silicones et je veux Y" → {intent: "recommendation", need: "Y", body_zone: null, concern: "sensitivity", confidence: 0.7}

Codes need courants:
  odor_control_feet, hydration_face, anti_aging, sensitivity_face, shampoo_dry_hair,
  hand_care, acne_prone, sun_protection, lip_care, eye_care, scalp_health, body_hydration,
  anti_cellulite, brightening, calming_sensitive
`;

/**
 * Détecte l'intent d'un message utilisateur
 * @param message Message utilisateur en français ou anglais
 * @returns Promise<ProductIntent>
 */
export async function detectProductIntent(message: string): Promise<ProductIntent> {
  if (!message || message.trim().length === 0) {
    return {
      intent: 'unknown',
      need: '',
      body_zone: null,
      concern: null,
      confidence: 0,
      raw_message: message,
      detected_at: new Date(),
    };
  }

  try {
    const client = new Anthropic();

    const startTime = performance.now();

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022', // Use Sonnet instead of 4o-mini (equivalent capability, better pricing)
      max_tokens: 200,
      system: INTENT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`[detectProductIntent] API call took ${duration.toFixed(0)}ms`);

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', content.text);
      return {
        intent: 'unknown',
        need: '',
        body_zone: null,
        concern: null,
        confidence: 0,
        raw_message: message,
        detected_at: new Date(),
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      intent: parsed.intent || 'unknown',
      need: parsed.need || '',
      body_zone: parsed.body_zone || null,
      concern: parsed.concern || null,
      confidence: parsed.confidence || 0,
      raw_message: message,
      detected_at: new Date(),
    };
  } catch (error) {
    console.error('[detectProductIntent] Error:', error);
    return {
      intent: 'unknown',
      need: '',
      body_zone: null,
      concern: null,
      confidence: 0,
      raw_message: message,
      detected_at: new Date(),
    };
  }
}

/**
 * Détecte les restrictions mentionnées dans un message
 * (e.g., "Je suis allergique aux silicones")
 */
export function detectRestrictions(message: string): {
  ingredients: string[];
  families: string[];
} {
  const ingredients: string[] = [];
  const families: string[] = [];
  const seenFamilies = new Set<string>();

  // Patterns simples qui matchent mieux
  const allergicPatterns = [
    /allergi[ée]?s? (?:aux|à les|au|à) ([^,.\n]+)/gi,
    /allergique (?:aux|à les|au|à) ([^,.\n]+)/gi,
    /sensible (?:aux|à les|au|à) ([^,.\n]+)/gi,
    /sensible aux? ([^,.\n]+)/gi,
    /intolér[ae]nt[es]? (?:aux|à les|au|à) ([^,.\n]+)/gi,
    /évite ([^,.\n]+)/gi,
    /sans ([^,.\n]+)/gi,
    /pas (?:d'|de |d')?([^,.\n]+)/gi,
  ];

  const lowerMsg = message.toLowerCase();

  // First pass: exact name matching for known families
  if (lowerMsg.includes('silicone')) {
    families.push('silicones');
    seenFamilies.add('silicones');
  }
  if (lowerMsg.includes('paraben')) {
    families.push('parabens');
    seenFamilies.add('parabens');
  }
  if (lowerMsg.includes('alcool') || lowerMsg.includes('alcohol')) {
    families.push('alcohols');
    seenFamilies.add('alcohols');
  }
  if (lowerMsg.includes('sulfate')) {
    families.push('sulfates');
    seenFamilies.add('sulfates');
  }
  if (lowerMsg.includes('phtalate') || lowerMsg.includes('phthalate')) {
    families.push('phthalates');
    seenFamilies.add('phthalates');
  }

  // Second pass: pattern matching for additional restrictions
  allergicPatterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(lowerMsg)) !== null) {
      const restriction = match[1].toLowerCase().trim();

      // Check if it's a known family
      if (restriction.includes('sil')) {
        if (!seenFamilies.has('silicones')) {
          families.push('silicones');
          seenFamilies.add('silicones');
        }
      } else if (restriction.includes('paraben')) {
        if (!seenFamilies.has('parabens')) {
          families.push('parabens');
          seenFamilies.add('parabens');
        }
      } else if (restriction.includes('alcool') || restriction.includes('alcohol')) {
        if (!seenFamilies.has('alcohols')) {
          families.push('alcohols');
          seenFamilies.add('alcohols');
        }
      } else if (restriction.includes('sulfate')) {
        if (!seenFamilies.has('sulfates')) {
          families.push('sulfates');
          seenFamilies.add('sulfates');
        }
      } else if (restriction.includes('phtalate')) {
        if (!seenFamilies.has('phthalates')) {
          families.push('phthalates');
          seenFamilies.add('phthalates');
        }
      } else {
        // Unknown restriction, add as ingredient if not already seen
        if (!ingredients.includes(restriction)) {
          ingredients.push(restriction);
        }
      }
    }
  });

  return { ingredients, families };
}
