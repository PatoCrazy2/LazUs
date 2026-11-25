import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../../server'
import { getDb } from '../../server/db'
import { dailyActivities } from '../../server/db/schema'
import { seedActivityPrompts } from '../../server/db/seeds/prompts'
import { ActivitiesService } from '../../server/features/activities/activities.service'
import { getTestEnv, truncateAuthTables } from '../helpers/db'

const env = getTestEnv()

async function registerUser(email: string, displayName: string) {
  const res = await app.request(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'Password123!',
        displayName,
      }),
    },
    env
  )
  const setCookie = res.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  const data = (await res.json()) as { user: { id: string } }
  return { cookie, userId: data.user.id }
}

async function createPairedCouple(prefix: string) {
  const userA = await registerUser(`${prefix}-a@example.com`, `${prefix} A`)
  const userB = await registerUser(`${prefix}-b@example.com`, `${prefix} B`)

  const inviteRes = await app.request(
    '/api/couple/invite-code',
    {
      method: 'POST',
      headers: { Cookie: userA.cookie },
    },
    env
  )
  const inviteData = (await inviteRes.json()) as { invitation_code: string }

  const pairRes = await app.request(
    '/api/couple/pair',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
      body: JSON.stringify({
        identifier: inviteData.invitation_code,
        client_mutation_id: crypto.randomUUID(),
      }),
    },
    env
  )
  const pairData = (await pairRes.json()) as { couple_id: string }

  return { userA, userB, coupleId: pairData.couple_id }
}

describe('Feature Activities - Hito 3 (Catálogo 3 Ejes & Zero-Leak Blind Reveal)', () => {
  beforeAll(async () => {
    const db = getDb(env.DATABASE_URL)
    await seedActivityPrompts(db)
  })

  beforeEach(async () => {
    await truncateAuthTables()
  })

  it('1. Rechaza con 403 si el usuario no pertenece a una pareja activa', async () => {
    const solo = await registerUser('solo@example.com', 'Solo')

    const res = await app.request(
      '/api/activities/today',
      { method: 'GET', headers: { Cookie: solo.cookie } },
      env
    )

    expect(res.status).toBe(403)
  })

  it('2. Genera actividad diaria única y segura ante concurrencia (A y B reciben la misma)', async () => {
    const { userA, userB } = await createPairedCouple('conc')

    const [resA, resB] = await Promise.all([
      app.request('/api/activities/today', { method: 'GET', headers: { Cookie: userA.cookie } }, env),
      app.request('/api/activities/today', { method: 'GET', headers: { Cookie: userB.cookie } }, env),
    ])

    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)

    const actA = (await resA.json()) as any
    const actB = (await resB.json()) as any

    expect(actA.id).toBe(actB.id)
    expect(actA.status).toBe('pending')
    expect(actA.my_submission).toBeNull()
    expect(actA.partner_completed).toBe(false)
    expect(actA.partner_submission).toBeUndefined()
  })

  it('3. INVARIANTE ZERO-LEAK + Inmutabilidad (409) + Idempotencia (200) + Desbloqueo atómico + Historial', async () => {
    const { userA, userB, coupleId } = await createPairedCouple('reveal')
    const db = getDb(env.DATABASE_URL)

    // Forzar actividad de hoy de tipo text_only para prueba determinística
    const todayRes = await app.request(
      '/api/activities/today',
      { method: 'GET', headers: { Cookie: userA.cookie } },
      env
    )
    const todayData = (await todayRes.json()) as any

    // Insertar una actividad de hoy limpia text_only si la aleatoria no lo fue
    let activityId = todayData.id as string
    if (todayData.response_type !== 'text_only') {
      await db.delete(dailyActivities)
      const [inserted] = await db
        .insert(dailyActivities)
        .values({
          coupleId,
          logicalDate: todayData.logical_date,
          prompt: '¿Qué te hizo sonreír hoy?',
          category: 'gratitude',
          tone: 'tender',
          occasion: 'daily',
          responseType: 'text_only',
          status: 'pending',
        })
        .returning()
      activityId = inserted.id
    }

    const secretAnswerA = 'SECRETO_ULTRA_PRIVADO_DE_A_12345'
    const mutationIdA = crypto.randomUUID()

    // A envía su respuesta
    const subARes = await app.request(
      `/api/activities/${activityId}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          client_mutation_id: mutationIdA,
          activity_id: activityId,
          content: secretAnswerA,
        }),
      },
      env
    )
    expect(subARes.status).toBe(200)
    const subAData = (await subARes.json()) as any
    expect(subAData.state).toBe('partner_pending')
    expect(subAData.activity_status).toBe('pending')

    // ZERO-LEAK CHECK 1: B consulta /today -> ve partner_completed: true pero CERO rastro del secreto de A
    const todayBRes = await app.request(
      '/api/activities/today',
      { method: 'GET', headers: { Cookie: userB.cookie } },
      env
    )
    expect(todayBRes.status).toBe(200)
    const rawTodayB = await todayBRes.text()
    expect(rawTodayB).not.toContain(secretAnswerA)
    const todayB = JSON.parse(rawTodayB)
    expect(todayB.partner_completed).toBe(true)
    expect(todayB.partner_submission).toBeUndefined()

    // ZERO-LEAK CHECK 2: /results debe devolver 403 Forbidden antes del reveal
    const resultsBeforeRes = await app.request(
      `/api/activities/${activityId}/results`,
      { method: 'GET', headers: { Cookie: userB.cookie } },
      env
    )
    expect(resultsBeforeRes.status).toBe(403)

    // IDEMPOTENCIA: Reintento de A con el mismo client_mutation_id -> 200 idéntico
    const retryARes = await app.request(
      `/api/activities/${activityId}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          client_mutation_id: mutationIdA,
          activity_id: activityId,
          content: secretAnswerA,
        }),
      },
      env
    )
    expect(retryARes.status).toBe(200)
    expect(await retryARes.json()).toEqual(subAData)

    // INMUTABILIDAD: A intenta cambiar su respuesta con nuevo client_mutation_id -> 409 Conflict
    const editARes = await app.request(
      `/api/activities/${activityId}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          client_mutation_id: crypto.randomUUID(),
          activity_id: activityId,
          content: 'Intentando editar',
        }),
      },
      env
    )
    expect(editARes.status).toBe(409)

    // DESBLOQUEO ATÓMICO: B envía su respuesta -> status pasa a 'revealed'
    const answerB = 'Verte llegar con café ❤️'
    const subBRes = await app.request(
      `/api/activities/${activityId}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({
          client_mutation_id: crypto.randomUUID(),
          activity_id: activityId,
          content: answerB,
        }),
      },
      env
    )
    expect(subBRes.status).toBe(200)
    const subBData = (await subBRes.json()) as any
    expect(subBData.state).toBe('revealed')
    expect(subBData.activity_status).toBe('revealed')

    // Ahora /results devuelve 200 con ambas respuestas
    const resultsAfterRes = await app.request(
      `/api/activities/${activityId}/results`,
      { method: 'GET', headers: { Cookie: userB.cookie } },
      env
    )
    expect(resultsAfterRes.status).toBe(200)
    const resultsAfter = (await resultsAfterRes.json()) as any
    expect(resultsAfter.status).toBe('revealed')
    expect(resultsAfter.my_submission.content).toBe(answerB)
    expect(resultsAfter.partner_submission.content).toBe(secretAnswerA)

    // Aparece en /history
    const historyRes = await app.request(
      '/api/activities/history',
      { method: 'GET', headers: { Cookie: userA.cookie } },
      env
    )
    expect(historyRes.status).toBe(200)
    const history = (await historyRes.json()) as any
    expect(history.items).toHaveLength(1)
    expect(history.items[0].my_submission.content).toBe(secretAnswerA)
    expect(history.items[0].partner_submission.content).toBe(answerB)
  })

  it('4. Vigencia diaria estricta (400 en actividad de ayer) y aislamiento entre parejas (403)', async () => {
    const { userA, coupleId } = await createPairedCouple('exp')
    const { userA: intruder } = await createPairedCouple('other')
    const db = getDb(env.DATABASE_URL)

    const [yesterdayAct] = await db
      .insert(dailyActivities)
      .values({
        coupleId,
        logicalDate: '2020-01-01',
        prompt: 'Pregunta pasada',
        category: 'memories',
        tone: 'light',
        occasion: 'daily',
        responseType: 'text_only',
        status: 'pending',
      })
      .returning()

    // Intentar responder una actividad pasada -> 400
    const expiredRes = await app.request(
      `/api/activities/${yesterdayAct.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          client_mutation_id: crypto.randomUUID(),
          activity_id: yesterdayAct.id,
          content: 'Demasiado tarde',
        }),
      },
      env
    )
    expect(expiredRes.status).toBe(400)

    // Intruso de otra pareja intenta acceder -> 403
    const intruderRes = await app.request(
      `/api/activities/${yesterdayAct.id}/results`,
      { method: 'GET', headers: { Cookie: intruder.cookie } },
      env
    )
    expect(intruderRes.status).toBe(403)
  })

  it('5. Prioridad de fecha especial (Navidad 12-25) y buscador musical iTunes', async () => {
    const { userA } = await createPairedCouple('xmas')
    const db = getDb(env.DATABASE_URL)

    const mockFetch = (async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              trackId: 999111,
              trackName: 'Yellow',
              artistName: 'Coldplay',
              collectionName: 'Parachutes',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
              previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
              trackViewUrl: 'https://music.apple.com/track/999111',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as unknown as typeof fetch

    const service = new ActivitiesService(
      db,
      () => new Date('2026-12-25T18:00:00Z'),
      mockFetch
    )

    const xmasActivity = await service.getOrCreateTodayActivity(userA.userId)
    expect(xmasActivity.occasion).toBe('special_date')
    expect(xmasActivity.prompt).toContain('Navidad')

    const musicResult = await service.searchMusic('Yellow Coldplay')
    expect(musicResult.tracks).toHaveLength(1)
    expect(musicResult.tracks[0].artwork_url).toContain('600x600bb.jpg')
    expect(musicResult.tracks[0].preview_url).toBe('https://audio-ssl.itunes.apple.com/preview.m4a')
  })
})
