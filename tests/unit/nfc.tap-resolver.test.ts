import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db'
import { affectionApi, affectionStore } from '../../src/features/affection'
import { computeTapLogicalDate, resolveTapAction } from '../../src/features/nfc'

const REF_DATE = new Date('2026-11-25T18:30:00-06:00')
const TODAY_LOGICAL = computeTapLogicalDate(REF_DATE, 'America/Mexico_City')

describe('NFC /tap/:tagId Local Dexie Resolver (<50ms & Offline-First) - Fase 3', () => {
  beforeEach(async () => {
    await Promise.all([
      db.profile.clear(),
      db.couple.clear(),
      db.activities.clear(),
      db.outbox.clear(),
    ])
    affectionStore.resetState()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Opción A: redirige a /link/:identifier si el usuario no tiene pareja activa en Dexie', async () => {
    const decisionNoCouple = await resolveTapAction('NFC-BRACELET-01', {
      referenceDate: REF_DATE,
    })

    expect(decisionNoCouple.type).toBe('redirect_link')
    if (decisionNoCouple.type === 'redirect_link') {
      expect(decisionNoCouple.identifier).toBe('NFC-BRACELET-01')
    }
    expect(decisionNoCouple.elapsedMs).toBeLessThan(50)

    // También si existe registro de pareja pero aún está 'pending'
    await db.couple.put({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'pending',
    })

    const decisionPending = await resolveTapAction('NFC-BRACELET-02', {
      referenceDate: REF_DATE,
    })
    expect(decisionPending.type).toBe('redirect_link')
  })

  it('Caso 1: navega a la actividad diaria (answer) cuando no hay actividad hoy o falta responder', async () => {
    await db.couple.put({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      partnerId: '22222222-2222-4222-8222-222222222222',
      partnerName: 'Sofía',
    })

    // Subcaso 1a: Sin registros de actividad aún en caché local
    const emptyDecision = await resolveTapAction('NFC-TAG-A', { referenceDate: REF_DATE })
    expect(emptyDecision).toMatchObject({
      type: 'navigate_home',
      tapIntent: 'answer',
      caseNumber: 1,
    })
    expect(emptyDecision.elapsedMs).toBeLessThan(50)

    // Subcaso 1b: La última actividad en Dexie es de ayer (cambio de día lógico offline)
    await db.activities.put({
      id: 'act-yesterday',
      logicalDate: '2026-11-24',
      prompt: 'Reto de ayer',
      status: 'revealed',
      mySubmissionCompleted: true,
      partnerSubmissionCompleted: true,
    })

    const rolloverDecision = await resolveTapAction('NFC-TAG-A', { referenceDate: REF_DATE })
    expect(rolloverDecision).toMatchObject({
      type: 'navigate_home',
      tapIntent: 'answer',
      caseNumber: 1,
    })

    // Subcaso 1c: Actividad de hoy cargada pero el usuario aún no ha respondido
    await db.activities.put({
      id: 'act-today',
      logicalDate: TODAY_LOGICAL,
      prompt: '¿Cuál fue nuestro mejor recuerdo de este mes?',
      status: 'pending',
      mySubmissionCompleted: false,
      partnerSubmissionCompleted: true,
    })

    const pendingMineDecision = await resolveTapAction('NFC-TAG-A', { referenceDate: REF_DATE })
    expect(pendingMineDecision).toMatchObject({
      type: 'navigate_home',
      tapIntent: 'answer',
      caseNumber: 1,
    })
    expect(await db.outbox.count()).toBe(0)
  })

  it('Caso 2: envía toque de afecto en segundo plano (100% offline), vibra [40,60,40] y protege rebotes <2s', async () => {
    // Simular dispositivo completamente sin red
    vi.stubGlobal('navigator', { onLine: false })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const vibrateMock = vi.fn()

    await db.couple.put({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      partnerId: '22222222-2222-4222-8222-222222222222',
      partnerName: 'Sofía',
    })

    await db.activities.put({
      id: 'act-today-case2',
      logicalDate: TODAY_LOGICAL,
      prompt: 'Describe a tu pareja en 3 palabras',
      status: 'pending',
      mySubmissionCompleted: true,
      partnerSubmissionCompleted: false,
      myContent: 'Brillante, tierna, divertida',
    })

    const firstTap = await resolveTapAction('NFC-TAG-LOVE', {
      referenceDate: REF_DATE,
      nowMs: 1_000_000,
      vibrate: vibrateMock,
    })

    expect(firstTap).toMatchObject({
      type: 'navigate_home',
      tapIntent: 'affection_sent',
      caseNumber: 2,
      deduplicated: false,
    })
    expect(firstTap.elapsedMs).toBeLessThan(50)
    expect(vibrateMock).toHaveBeenCalledWith([40, 60, 40])
    expect(fetchSpy).not.toHaveBeenCalled()

    // Segundo escaneo accidental 350ms después -> absorbido por cooldown de 2s
    const accidentalDoubleTap = await resolveTapAction('NFC-TAG-LOVE', {
      referenceDate: REF_DATE,
      nowMs: 1_000_350,
      vibrate: vibrateMock,
    })

    expect(accidentalDoubleTap).toMatchObject({
      type: 'navigate_home',
      tapIntent: 'affection_sent',
      caseNumber: 2,
      deduplicated: true,
    })

    // Verificar que solo hay 1 evento en el Outbox listo para sincronizar cuando vuelva la red
    const outboxItems = await db.outbox.toArray()
    expect(outboxItems).toHaveLength(1)
    expect(outboxItems[0].mutation_type).toBe('SEND_AFFECTION')

    // Al volver la red, el Outbox sincroniza el evento con el mismo client_mutation_id
    vi.unstubAllGlobals()
    const apiSpy = vi.spyOn(affectionApi, 'sendAffection').mockResolvedValue({
      status: 'success',
      affection_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      client_mutation_id: outboxItems[0].client_mutation_id,
      event_type: 'heart_tap',
      created_at: new Date().toISOString(),
      message: 'Toque de afecto registrado.',
    })

    await affectionStore.flushOutbox()
    expect(apiSpy).toHaveBeenCalledTimes(1)
    expect(await db.outbox.count()).toBe(0)
  })

  it('Caso 3: abre directamente los resultados revelados cuando ambos completaron hoy', async () => {
    const vibrateMock = vi.fn()

    await db.couple.put({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'active',
    })

    await db.activities.put({
      id: 'act-today-revealed',
      logicalDate: TODAY_LOGICAL,
      prompt: 'Canción que te recuerda a nosotros',
      status: 'revealed',
      mySubmissionCompleted: true,
      partnerSubmissionCompleted: true,
      myContent: 'Yellow',
      partnerContent: ' Sparks',
    })

    const decision = await resolveTapAction('NFC-TAG-REVEAL', {
      referenceDate: REF_DATE,
      vibrate: vibrateMock,
    })

    expect(decision).toMatchObject({
      type: 'navigate_home',
      tapIntent: 'reveal',
      caseNumber: 3,
    })
    expect(decision.elapsedMs).toBeLessThan(50)
    expect(vibrateMock).not.toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(0)
  })

  it('Benchmark <50ms: mantiene latencia de resolución por debajo de 50ms en ejecuciones repetidas', async () => {
    await db.couple.put({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'active',
    })

    // Poblar historial de 30 días previos + hoy en Dexie para probar uso de índice logicalDate
    for (let day = 1; day <= 24; day++) {
      const dd = String(day).padStart(2, '0')
      await db.activities.put({
        id: `hist-${dd}`,
        logicalDate: `2026-11-${dd}`,
        prompt: `Pregunta histórica ${dd}`,
        status: 'revealed',
        mySubmissionCompleted: true,
        partnerSubmissionCompleted: true,
      })
    }

    await db.activities.put({
      id: 'act-bench-today',
      logicalDate: TODAY_LOGICAL,
      prompt: 'Pregunta de hoy',
      status: 'pending',
      mySubmissionCompleted: false,
      partnerSubmissionCompleted: false,
    })

    const durations: number[] = []
    for (let i = 0; i < 10; i++) {
      const res = await resolveTapAction(`NFC-BENCH-${i}`, { referenceDate: REF_DATE })
      durations.push(res.elapsedMs)
    }

    const maxDuration = Math.max(...durations)
    expect(maxDuration).toBeLessThan(50)
  })
})
