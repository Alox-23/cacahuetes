import { describe, expect, it, vi } from 'vitest'
import type { Preferences } from '../contract/types'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { createDataModule } from '../data/mockData'
import { createStorage, memoryBackend } from '../data/storage'
import { messageChips, preferenceSummaryChips, describeSelection } from './format'
import { createAssistant } from './mockAssistant'
import { parseRequest } from './parser'

// Tuesday 24 Nov 2026 → "el sábado" is 2026-11-28.
const NOW = new Date(2026, 10, 24, 12)
const instant = () => Promise.resolve()

function assistantFor(mode: 'onboarding' | 'request', prefs: Preferences | null = DEFAULT_PREFERENCES) {
  const savePreferences = vi.fn(async () => undefined)
  const a = createAssistant({ getPreferences: async () => prefs, savePreferences, now: () => NOW, delay: instant })
  a.reset(mode)
  return { a, savePreferences }
}

describe('assistant · simulated delay', () => {
  it('waits 500–900 ms before every reply', async () => {
    const delay = vi.fn(instant)
    const a = createAssistant({ getPreferences: async () => null, delay, random: () => 0.999 })
    a.reset('onboarding')
    await a.sendMessage({})
    const b = createAssistant({ getPreferences: async () => null, delay, random: () => 0 })
    b.reset('onboarding')
    await b.sendMessage({})
    expect(delay).toHaveBeenNthCalledWith(1, 900)
    expect(delay).toHaveBeenNthCalledWith(2, 500)
  })
})

describe('assistant · onboarding', () => {
  it('presents itself as an AI and walks the four questions', async () => {
    const { a, savePreferences } = assistantFor('onboarding')
    const first = await a.sendMessage({})
    expect(first.display?.intro?.[0]).toContain('tu asistente de IA')
    expect(first.display?.step).toEqual({ index: 1, total: 4 })
    expect(first.options).toHaveLength(8)
    expect(first.options?.every((o) => o.multiple)).toBe(true)

    const second = await a.sendMessage({ option: 'interests:arquitectura,interests:gastronomia' })
    expect(second.display?.lead).toEqual(['Apuntado.'])
    expect(second.display?.step?.index).toBe(2)
    expect(second.options?.filter((o) => o.value.startsWith('pace:')).every((o) => !o.multiple)).toBe(true)
    expect(second.options?.filter((o) => o.value.startsWith('transport:')).every((o) => o.multiple)).toBe(true)

    const third = await a.sendMessage({ option: 'pace:relajado,transport:a_pie,transport:transporte_publico' })
    expect(third.display?.step?.index).toBe(3)
    expect(third.options?.map((o) => o.label)).toEqual(['Solo', 'En pareja', 'Con niños', 'En grupo'])

    const fourth = await a.sendMessage({ option: 'company:pareja' })
    expect(fourth.display?.step?.index).toBe(4)
    expect(fourth.display?.hint).toBe('Afecta a las entradas y a los sitios para comer. Es la última pregunta.')

    const done = await a.sendMessage({ option: 'budget:medio' })
    expect(done.display?.complete).toBe(true)
    expect(savePreferences).toHaveBeenCalledWith({
      interests: ['arquitectura', 'gastronomia'],
      pace: 'relajado',
      transport: ['a_pie', 'transporte_publico'],
      company: 'pareja',
      budget: 'medio',
      needs: [],
    })
    expect(a.getState().onboardingComplete).toBe(true)
  })

  it('understands free text answers, accent- and case-insensitive', async () => {
    const { a, savePreferences } = assistantFor('onboarding')
    await a.sendMessage({})
    const r2 = await a.sendMessage({ text: 'MUSEOS y arte urbano' })
    expect(r2.display?.step?.index).toBe(2)
    await a.sendMessage({ text: 'intenso, en bici' })
    await a.sendMessage({ text: 'con niños' })
    await a.sendMessage({ text: 'alto' })
    expect(savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ interests: ['museos', 'arte_urbano'], pace: 'intenso', transport: ['bici'], company: 'con_ninos', budget: 'alto' }),
    )
  })

  it('keeps the question open when the answer is not understood', async () => {
    const { a } = assistantFor('onboarding')
    await a.sendMessage({})
    const r = await a.sendMessage({ text: 'patata' })
    expect(r.display?.lead?.[0]).toMatch(/No lo he entendido/)
    expect(r.display?.step?.index).toBe(1)
    expect(a.getState().onboardingStep).toBe(1)
  })

  it('echoes selections with human labels', () => {
    expect(describeSelection(['interests:arquitectura', 'interests:gastronomia'])).toBe('Arquitectura y gastronomía')
    expect(describeSelection(['pace:relajado', 'transport:a_pie', 'transport:transporte_publico'])).toBe(
      'Relajado, a pie y en transporte público',
    )
  })
})

describe('assistant · request slot filling', () => {
  it.each([
    ['5 horas en Barcelona, arquitectura y tapas', 'Barcelona'],
    ['Un día en Valencia con niños', 'Valencia'],
    ['Tarde tranquila en Sevilla, a pie', 'Sevilla'],
  ])('suggestion "%s" asks only what is missing, then summarizes', async (text, city) => {
    const { a } = assistantFor('request')
    const r1 = await a.sendMessage({ text })
    expect(r1.kind).toBe('question')
    expect(r1.text).toMatch(/¿qué día haces la ruta\?/)
    expect(r1.options?.map((o) => o.label)).toEqual(['Hoy', 'Mañana', 'Este sábado'])
    const r2 = await a.sendMessage({ option: 'date:saturday' })
    expect(r2.text).toMatch(/Solo me falta un dato: ¿desde dónde sales\?/)
    expect(r2.options?.map((o) => o.label)).toEqual(['Mi ubicación actual', 'Mi hotel', 'Otra dirección'])
    const r3 = await a.sendMessage({ option: 'start:hotel' })
    expect(r3.kind).toBe('summary')
    expect(r3.request).toMatchObject({ city, date: '2026-11-28', start: { label: 'Mi hotel' } })
  })

  it('reproduces the design sentence for the start question', async () => {
    const { a } = assistantFor('request')
    const r = await a.sendMessage({ text: 'El sábado tengo 5 horas en Barcelona. Quiero ver la Sagrada Família y comer tapas.' })
    expect(r.text).toBe('Hecho, ya tengo ciudad, día, duración y dos imprescindibles. Solo me falta un dato: ¿desde dónde sales?')
    const s = await a.sendMessage({ option: 'start:hotel' })
    expect(s.request).toEqual({
      city: 'Barcelona',
      date: '2026-11-28',
      timeWindow: { from: '10:00', to: '15:00' },
      start: { label: 'Mi hotel' },
      mustInclude: ['Sagrada Família', 'Tapas'],
    })
  })

  it('answers unrecognized text by asking city, day, time and start', async () => {
    const { a } = assistantFor('request')
    const r = await a.sendMessage({ text: 'hola' })
    expect(r.kind).toBe('question')
    expect(r.text).toContain('Cuéntame ciudad, día, cuánto tiempo tienes y desde dónde sales')
    expect(r.options?.map((o) => o.label)).toEqual(['Barcelona', 'Valencia', 'Sevilla'])
  })

  it('asks slots one at a time in order city → date → time → start', async () => {
    const { a } = assistantFor('request')
    await a.sendMessage({ text: 'hola' })
    const date = await a.sendMessage({ option: 'city:Valencia' })
    expect(date.options?.[0].value).toBe('date:today')
    const time = await a.sendMessage({ option: 'date:tomorrow' })
    expect(time.options?.map((o) => o.label)).toEqual(['3 horas', '5 horas', 'Todo el día'])
    const start = await a.sendMessage({ option: 'time:3h' })
    expect(start.options?.[0].value).toBe('start:current')
    const other = await a.sendMessage({ option: 'start:other' })
    expect(other.kind).toBe('question')
    expect(other.options).toBeUndefined()
    const summary = await a.sendMessage({ text: 'Calle de Colón 5' })
    expect(summary.request).toMatchObject({
      city: 'Valencia',
      date: '2026-11-25',
      timeWindow: { from: '10:00', to: '13:00' },
      start: { label: 'Calle de Colón 5' },
    })
  })

  it('re-parses free text after the summary and returns an updated summary', async () => {
    const { a } = assistantFor('request')
    await a.sendMessage({ text: 'Tarde tranquila en Sevilla, a pie' })
    await a.sendMessage({ option: 'date:today' })
    await a.sendMessage({ option: 'start:current' })
    const updated = await a.sendMessage({ text: 'mejor el domingo' })
    expect(updated.kind).toBe('summary')
    expect(updated.display?.lead).toEqual(['Actualizado con lo que me has dicho.'])
    expect(updated.request?.date).toBe('2026-11-29')
  })

  it('separates message chips from preference chips', async () => {
    const { a } = assistantFor('request')
    await a.sendMessage({ text: '5 horas en Barcelona, arquitectura y tapas' })
    await a.sendMessage({ option: 'date:saturday' })
    const { request } = await a.sendMessage({ option: 'start:hotel' })
    if (!request) throw new Error('missing request')
    expect(messageChips(request)).toEqual([
      'Barcelona',
      'Sáb 28 nov',
      '5 horas',
      'Desde mi hotel',
      'Sagrada Família',
      'Tapas',
      'Arquitectura',
      'Gastronomía',
    ])
    const prefs: Preferences = { ...DEFAULT_PREFERENCES, company: 'pareja', pace: 'relajado' }
    expect(preferenceSummaryChips(prefs, request)).toEqual(['En pareja', 'Relajado', 'A pie y metro', 'Presupuesto medio'])
    const sevilla = { ...request, overrides: { pace: 'relajado' as const, transport: ['a_pie' as const] } }
    expect(preferenceSummaryChips(prefs, sevilla)).toEqual(['En pareja', 'Presupuesto medio'])
  })
})

describe('parser', () => {
  it('distinguishes "mañana" as date from "la mañana" as day part', () => {
    expect(parseRequest('mañana en Madrid', NOW)).toMatchObject({ city: 'Madrid', date: '2026-11-25' })
    expect(parseRequest('mañana por la mañana en Bilbao', NOW)).toMatchObject({
      date: '2026-11-25',
      timeWindow: { from: '09:00', to: '13:00' },
    })
    expect(parseRequest('esta mañana', NOW).date).toBeUndefined()
  })

  it('reads hours, day parts, weekdays and start points', () => {
    expect(parseRequest('3 horas por la tarde', NOW).timeWindow).toEqual({ from: '16:00', to: '19:00' })
    expect(parseRequest('dos horas a las 11', NOW).timeWindow).toEqual({ from: '11:00', to: '13:00' })
    expect(parseRequest('todo el día', NOW).timeWindow).toEqual({ from: '10:00', to: '19:00' })
    expect(parseRequest('el viernes', NOW).date).toBe('2026-11-27')
    expect(parseRequest('hoy', NOW).date).toBe('2026-11-24')
    expect(parseRequest('salgo desde mi hotel', NOW).start).toEqual({ label: 'Mi hotel' })
  })

  it('infers the city from an unambiguous place', () => {
    expect(parseRequest('quiero ver la Sagrada Familia', NOW)).toMatchObject({ city: 'Barcelona', mustInclude: ['Sagrada Família'] })
    expect(parseRequest('quiero ver la catedral', NOW).city).toBeUndefined()
  })
})

describe('assistant · change mode', () => {
  async function changeSetup() {
    const storage = createStorage(memoryBackend())
    const data = createDataModule(storage, { latency: 0, newId: () => 'r1' })
    await data.savePreferences(DEFAULT_PREFERENCES)
    const route = await data.createRoute({
      city: 'Barcelona',
      date: '2026-12-05',
      timeWindow: { from: '10:00', to: '15:00' },
      start: { label: 'Mi hotel' },
      mustInclude: ['Sagrada Família', 'Tapas'],
    })
    const a = createAssistant({
      getPreferences: data.getPreferences,
      getRoute: data.getRoute,
      refineRoute: data.refineRoute,
      undo: data.undo,
      now: () => NOW,
      delay: instant,
    })
    a.reset('change', { route })
    return { a, data, route }
  }

  it('greets with the four quick actions', async () => {
    const { a } = await changeSetup()
    const r = await a.sendMessage({})
    expect(r.options?.map((o) => o.label)).toEqual(['Menos caminar', 'Más comida', 'Más barato', 'Añadir pausa'])
  })

  it('applies two changes from the design sentence and can undo them', async () => {
    const { a, data, route } = await changeSetup()
    const r = await a.sendMessage({ text: 'Menos caminar, y añade una pausa para café.' })
    expect(r.kind).toBe('change')
    expect(r.text).toBe('Hecho. He cambiado dos cosas:')
    expect(r.changes).toEqual([
      'De Casa Batlló a Mercat de la Boqueria vas en metro en lugar de a pie.',
      'Pausa de 20 min para café después de Casa Batlló.',
    ])
    expect(r.display?.footer).toBe('La ruta termina ahora a las 15:13.')
    expect((await data.getRoute(route.id)).version).toBe(3)

    const undone = await a.sendMessage({ option: 'undo' })
    expect(undone.text).toContain('15:00')
    expect(await data.getRoute(route.id)).toEqual(route)
  })

  it('handles each quick action', async () => {
    const { a } = await changeSetup()
    const food = await a.sendMessage({ option: 'quick:mas_comida' })
    expect(food.changes?.[0]).toMatch(/He añadido Cal Pep para comer después de/)
    const cheaper = await a.sendMessage({ option: 'quick:mas_barato' })
    expect(cheaper.changes?.[0]).toMatch(/He cambiado Sagrada Família por .+, que es gratis\./)
  })

  it('says so when the change is not understood', async () => {
    const { a } = await changeSetup()
    const r = await a.sendMessage({ text: 'ponle purpurina' })
    expect(r.kind).toBe('question')
    expect(r.text).toMatch(/No he entendido el cambio/)
    expect(r.options).toHaveLength(4)
  })
})
