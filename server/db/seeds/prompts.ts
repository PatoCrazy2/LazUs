import type {
  ActivityCategory,
  ActivityOccasion,
  ActivityResponseType,
  ActivityTone,
  PromptConfig,
} from '../../../shared'
import type { DbClient } from '../index'
import { activityPrompts } from '../schema'

export interface SeedPrompt {
  slug: string
  prompt: string
  category: ActivityCategory
  tone: ActivityTone
  occasion: ActivityOccasion
  intensity: number
  responseType: ActivityResponseType
  promptConfig?: PromptConfig
  specialDate?: string | null
}

export const INITIAL_PROMPTS: SeedPrompt[] = [
  // Conociéndonos
  {
    slug: 'gtk-first-impression',
    prompt: '¿Qué fue lo primero que pensaste de mí la primera vez que nos vimos?',
    category: 'getting_to_know',
    tone: 'tender',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  {
    slug: 'gtk-superpower',
    prompt: 'Si pudieras darme un superpoder para hacerme la vida más fácil, ¿cuál elegirías?',
    category: 'getting_to_know',
    tone: 'playful',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  // Recuerdos
  {
    slug: 'mem-favorite-trip',
    prompt: '¿Cuál ha sido nuestro momento favorito juntos este año y por qué?',
    category: 'memories',
    tone: 'tender',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  {
    slug: 'mem-laugh-cry',
    prompt: 'Recuerda una vez en la que nos reímos tanto que casi no podíamos respirar.',
    category: 'memories',
    tone: 'playful',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  // Futuro
  {
    slug: 'fut-sunday-morning',
    prompt: 'Imagina nuestro domingo ideal dentro de 5 años: ¿dónde estamos y qué desayunamos?',
    category: 'future',
    tone: 'tender',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  {
    slug: 'fut-next-trip',
    prompt: '¿Qué destino deberíamos poner en el puesto #1 de nuestra lista de viajes?',
    category: 'future',
    tone: 'light',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  // Gratitud
  {
    slug: 'grat-small-detail',
    prompt: 'Menciona un detalle pequeño que hice esta semana y que te alegró el día.',
    category: 'gratitude',
    tone: 'tender',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  {
    slug: 'grat-admire',
    prompt: '¿Qué es lo que más admiras de la forma en que enfrento los días difíciles?',
    category: 'gratitude',
    tone: 'deep',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  // Vida y Valores
  {
    slug: 'val-non-negotiable',
    prompt: '¿Qué valor sientes que es el pilar más fuerte de nuestra relación?',
    category: 'life_values',
    tone: 'deep',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  // Música (Híbrido)
  {
    slug: 'mus-reminds-me-of-you',
    prompt: 'Elige una canción que escuchas y automáticamente piensas en mí.',
    category: 'music',
    tone: 'tender',
    occasion: 'daily',
    intensity: 1,
    responseType: 'music',
  },
  {
    slug: 'mus-mood-today',
    prompt: '¿Cuál es la banda sonora de tu día hoy?',
    category: 'music',
    tone: 'light',
    occasion: 'daily',
    intensity: 1,
    responseType: 'music',
  },
  // Romance
  {
    slug: 'rom-miss-most',
    prompt: '¿Qué parte de estar cerca de mí extrañas más cuando no nos vemos?',
    category: 'romance',
    tone: 'tender',
    occasion: 'long_distance',
    intensity: 1,
    responseType: 'text_only',
  },
  {
    slug: 'rom-date-night',
    prompt: '¿Qué te gustaría que hiciéramos en nuestra próxima cita a solas?',
    category: 'romance',
    tone: 'playful',
    occasion: 'daily',
    intensity: 2,
    responseType: 'text_only',
  },
  // Juego (Choice & Prediction)
  {
    slug: 'play-would-you-rather',
    prompt: '¿Qué prefieres para nuestra próxima noche libre?',
    category: 'play',
    tone: 'playful',
    occasion: 'daily',
    intensity: 1,
    responseType: 'choice',
    promptConfig: {
      options: [
        'Maratón de pelis con cobija y snacks',
        'Salir a cenar a un lugar nuevo',
        'Cocinar algo juntos con música',
        'Caminata nocturna por la ciudad',
      ],
    },
  },
  {
    slug: 'play-predict-coffee',
    prompt: '¿Cuál es la bebida o snack infalible que nunca falta cuando salimos?',
    category: 'play',
    tone: 'playful',
    occasion: 'daily',
    intensity: 1,
    responseType: 'prediction',
  },
  // Juntos IRL
  {
    slug: 'irl-20s-hug',
    prompt: 'Reto de hoy: dense un abrazo de al menos 20 segundos sin mirar el celular y cuéntame qué sentiste.',
    category: 'together_irl',
    tone: 'tender',
    occasion: 'daily',
    intensity: 1,
    responseType: 'text_only',
  },
  // Check-in Diario
  {
    slug: 'chk-energy-today',
    prompt: '¿Cómo llega tu energía hoy del 1 al 5?',
    category: 'daily_checkin',
    tone: 'light',
    occasion: 'daily',
    intensity: 1,
    responseType: 'scale',
    promptConfig: {
      min: 1,
      max: 5,
      min_label: 'Agotado/a',
      max_label: 'Con todo',
      emojis: ['🪫', '😔', '😌', '😊', '⚡'],
    },
  },
  // Fechas Especiales
  {
    slug: 'special-valentines',
    prompt: 'Feliz San Valentín ❤️ Si hoy pudieras escribirme una promesa para este año, ¿cuál sería?',
    category: 'romance',
    tone: 'tender',
    occasion: 'special_date',
    intensity: 1,
    responseType: 'text_only',
    specialDate: '02-14',
  },
  {
    slug: 'special-christmas',
    prompt: 'En esta Navidad 🎄 ¿cuál es el mejor regalo no material que nos dimos este año?',
    category: 'gratitude',
    tone: 'tender',
    occasion: 'special_date',
    intensity: 1,
    responseType: 'text_only',
    specialDate: '12-25',
  },
  {
    slug: 'special-new-year',
    prompt: '¡Feliz Año Nuevo! ✨ ¿Qué aventura quieres que vivamos sí o sí en los próximos 12 meses?',
    category: 'future',
    tone: 'playful',
    occasion: 'special_date',
    intensity: 1,
    responseType: 'text_only',
    specialDate: '01-01',
  },
  {
    slug: 'special-anniversary',
    prompt: '¡Feliz Aniversario! 🥂 ¿Qué canción resume mejor nuestra historia hasta hoy?',
    category: 'music',
    tone: 'tender',
    occasion: 'special_date',
    intensity: 1,
    responseType: 'music',
    specialDate: 'anniversary',
  },
]

export async function seedActivityPrompts(db: DbClient) {
  await db
    .insert(activityPrompts)
    .values(
      INITIAL_PROMPTS.map((p) => ({
        slug: p.slug,
        prompt: p.prompt,
        category: p.category,
        tone: p.tone,
        occasion: p.occasion,
        intensity: p.intensity,
        responseType: p.responseType,
        promptConfig: p.promptConfig ?? null,
        specialDate: p.specialDate ?? null,
      }))
    )
    .onConflictDoNothing({ target: activityPrompts.slug })
}
