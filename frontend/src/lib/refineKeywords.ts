import { phraseIndex } from './text'

export type QuickRefine = 'menos_caminar' | 'mas_comida' | 'mas_barato' | 'anadir_pausa'

export const QUICK_REFINES: QuickRefine[] = ['menos_caminar', 'mas_comida', 'mas_barato', 'anadir_pausa']

/** Keyword table shared by the assistant (change mode) and refineRoute({type:"text"}). */
export const REFINE_KEYWORDS: Record<QuickRefine, string[]> = {
  menos_caminar: ['menos caminar', 'caminar menos', 'andar menos', 'menos andar', 'menos a pie'],
  anadir_pausa: ['pausa', 'cafe', 'descanso', 'descansar'],
  mas_barato: ['barato', 'barata', 'ahorrar', 'economico', 'economica'],
  mas_comida: ['comida', 'comer', 'tapas', 'restaurante'],
}

/** Recognized quick refines in the order they appear in the sentence (each at most once). */
export function parseRefineText(text: string): QuickRefine[] {
  const hits: { action: QuickRefine; at: number }[] = []
  for (const action of QUICK_REFINES) {
    const positions = REFINE_KEYWORDS[action].map((k) => phraseIndex(text, k)).filter((i) => i >= 0)
    if (positions.length > 0) hits.push({ action, at: Math.min(...positions) })
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.action)
}
