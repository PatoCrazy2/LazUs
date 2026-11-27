import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../../server'
import { getDb } from '../../server/db'
import { dailyActivities } from '../../server/db/schema'
import { computeLogicalDateParts } from '../../server/features/activities/activities.service'
import { localDevMediaStore } from '../../server/features/media/r2.signer'
import { UPLOAD_URL_TTL_SECONDS, VIEW_URL_TTL_SECONDS } from '../../shared'
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

async function requestUploadAndPut(
  cookie: string,
  kind: 'photo' | 'voice' | 'collage',
  contentType: string,
  bytes: Uint8Array
) {
  const uploadUrlRes = await app.request(
    '/api/media/upload-url',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        kind,
        content_type: contentType,
        size_bytes: bytes.byteLength,
      }),
    },
    env
  )
  expect(uploadUrlRes.status).toBe(200)
  const data = (await uploadUrlRes.json()) as {
    media_key: string
    upload_url: string
    method: 'PUT'
    headers: Record<string, string>
    expires_in: number
  }
  expect(data.method).toBe('PUT')
  expect(data.expires_in).toBeLessThanOrEqual(UPLOAD_URL_TTL_SECONDS)

  // Subida directa al destino prefirmado (en test: /api/media/dev-object)
  const parsed = new URL(data.upload_url)
  const putRes = await app.request(
    `${parsed.pathname}${parsed.search}`,
    {
      method: 'PUT',
      headers: data.headers,
      body: bytes,
    },
    env
  )
  expect(putRes.status).toBe(200)

  return data
}

describe('Feature Media - Hito 6 (R2 Direct Upload, Zero-Leak View & Weekly Collage)', () => {
  beforeEach(async () => {
    await truncateAuthTables()
    localDevMediaStore.clear()
  })

  it('1. Rechaza con 403 a usuarios sin pareja activa y valida MIME/tamaño con 400', async () => {
    const solo = await registerUser('solo-media@example.com', 'Solo')

    const resUpload = await app.request(
      '/api/media/upload-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: solo.cookie },
        body: JSON.stringify({
          kind: 'photo',
          content_type: 'image/webp',
          size_bytes: 120_000,
        }),
      },
      env
    )
    expect(resUpload.status).toBe(403)

    const { userA } = await createPairedCouple('val')
    const badMimeRes = await app.request(
      '/api/media/upload-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          kind: 'photo',
          content_type: 'application/x-msdownload',
          size_bytes: 1024,
        }),
      },
      env
    )
    expect(badMimeRes.status).toBe(400)
  })

  it('2. INVARIANTE ZERO-LEAK EN MEDIA: bloquea view-url de la pareja antes de revealed (403) y desbloquea tras revelar (200)', async () => {
    const { userA, userB, coupleId } = await createPairedCouple('zeroleak')
    const db = getDb(env.DATABASE_URL)
    const { logicalDate } = computeLogicalDateParts('America/Mexico_City')

    const [activity] = await db
      .insert(dailyActivities)
      .values({
        coupleId,
        logicalDate,
        prompt: 'Comparte una foto de tu café de hoy',
        category: 'daily_checkin',
        tone: 'light',
        occasion: 'daily',
        responseType: 'photo_only',
        status: 'pending',
      })
      .returning()

    const photoABytes = new TextEncoder().encode('fake-webp-photo-a')
    const uploadA = await requestUploadAndPut(userA.cookie, 'photo', 'image/webp', photoABytes)
    expect(uploadA.media_key.startsWith(`couples/${coupleId}/photo/`)).toBe(true)

    // A sella su respuesta con foto
    const submitARes = await app.request(
      `/api/activities/${activity!.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          client_mutation_id: crypto.randomUUID(),
          activity_id: activity!.id,
          media_key: uploadA.media_key,
          payload: { type: 'photo', mime_type: 'image/webp', width: 1920, height: 1080 },
        }),
      },
      env
    )
    expect(submitARes.status).toBe(200)

    // A SÍ puede ver su propia foto antes del reveal
    const viewOwnRes = await app.request(
      '/api/media/view-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({ media_key: uploadA.media_key }),
      },
      env
    )
    expect(viewOwnRes.status).toBe(200)
    const viewOwnData = (await viewOwnRes.json()) as { view_url: string; expires_in: number }
    expect(viewOwnData.expires_in).toBeLessThanOrEqual(VIEW_URL_TTL_SECONDS)

    // ZERO-LEAK: B NO puede pedir view-url de la foto de A mientras la actividad siga pending
    const leakAttemptRes = await app.request(
      '/api/media/view-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({ media_key: uploadA.media_key }),
      },
      env
    )
    expect(leakAttemptRes.status).toBe(403)

    // B sube su propia foto y sella -> desbloqueo atómico a revealed
    const photoBBytes = new TextEncoder().encode('fake-webp-photo-b')
    const uploadB = await requestUploadAndPut(userB.cookie, 'photo', 'image/webp', photoBBytes)

    const submitBRes = await app.request(
      `/api/activities/${activity!.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({
          client_mutation_id: crypto.randomUUID(),
          activity_id: activity!.id,
          media_key: uploadB.media_key,
        }),
      },
      env
    )
    expect(submitBRes.status).toBe(200)
    const submitBData = (await submitBRes.json()) as { activity_status: string }
    expect(submitBData.activity_status).toBe('revealed')

    // Ahora B SÍ puede obtener view-url de la foto de A y descargar los bytes reales
    const viewAfterRevealRes = await app.request(
      '/api/media/view-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({ media_key: uploadA.media_key }),
      },
      env
    )
    expect(viewAfterRevealRes.status).toBe(200)
    const viewData = (await viewAfterRevealRes.json()) as { view_url: string; expires_in: number }
    expect(viewData.expires_in).toBeLessThanOrEqual(VIEW_URL_TTL_SECONDS)

    const parsedGet = new URL(viewData.view_url)
    const getObjRes = await app.request(`${parsedGet.pathname}${parsedGet.search}`, { method: 'GET' }, env)
    expect(getObjRes.status).toBe(200)
    expect(await getObjRes.text()).toBe('fake-webp-photo-a')
  })

  it('3. Aislamiento estricto entre parejas (403 en view-url y en inyección de media_key ajena)', async () => {
    const couple1 = await createPairedCouple('iso1')
    const couple2 = await createPairedCouple('iso2')
    const db = getDb(env.DATABASE_URL)
    const { logicalDate } = computeLogicalDateParts('America/Mexico_City')

    const upload1 = await requestUploadAndPut(
      couple1.userA.cookie,
      'voice',
      'audio/webm',
      new TextEncoder().encode('voice-note-couple-1')
    )

    // Couple 2 intenta leer media_key de Couple 1 -> 403
    const crossViewRes = await app.request(
      '/api/media/view-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: couple2.userA.cookie },
        body: JSON.stringify({ media_key: upload1.media_key }),
      },
      env
    )
    expect(crossViewRes.status).toBe(403)

    // Couple 2 intenta inyectar el media_key de Couple 1 en su propia actividad voice -> 403
    const [act2] = await db
      .insert(dailyActivities)
      .values({
        coupleId: couple2.coupleId,
        logicalDate,
        prompt: 'Envía una nota de voz de buenas noches',
        category: 'romance',
        tone: 'tender',
        occasion: 'daily',
        responseType: 'voice',
        status: 'pending',
      })
      .returning()

    const injectRes = await app.request(
      `/api/activities/${act2!.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: couple2.userA.cookie },
        body: JSON.stringify({
          client_mutation_id: crypto.randomUUID(),
          activity_id: act2!.id,
          media_key: upload1.media_key,
          payload: { type: 'voice', duration_sec: 12, mime_type: 'audio/webm' },
        }),
      },
      env
    )
    expect(injectRes.status).toBe(403)
  })

  it('4. Collage Semanal Híbrido: compila highlights revelados y persiste renderizado en R2 para ambos', async () => {
    const { userA, userB, coupleId } = await createPairedCouple('collage')
    const coupleOther = await createPairedCouple('other-col')
    const db = getDb(env.DATABASE_URL)
    const { logicalDate } = computeLogicalDateParts('America/Mexico_City')

    // Sin actividades reveladas -> lista vacía
    const emptyRes = await app.request(
      '/api/media/collages',
      { method: 'GET', headers: { Cookie: userA.cookie } },
      env
    )
    expect(emptyRes.status).toBe(200)
    expect(((await emptyRes.json()) as { items: unknown[] }).items).toHaveLength(0)

    // Crear actividad 'both' (foto + texto) y completarla por ambos
    const [act] = await db
      .insert(dailyActivities)
      .values({
        coupleId,
        logicalDate,
        prompt: 'Foto y frase de nuestro momento favorito',
        category: 'memories',
        tone: 'tender',
        occasion: 'daily',
        responseType: 'both',
        status: 'pending',
      })
      .returning()

    const upA = await requestUploadAndPut(
      userA.cookie,
      'photo',
      'image/webp',
      new TextEncoder().encode('img-a')
    )
    const upB = await requestUploadAndPut(
      userB.cookie,
      'photo',
      'image/webp',
      new TextEncoder().encode('img-b')
    )

    await app.request(
      `/api/activities/${act!.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({
          client_mutation_id: crypto.randomUUID(),
          activity_id: act!.id,
          content: 'Atardecer increíble',
          media_key: upA.media_key,
        }),
      },
      env
    )
    await app.request(
      `/api/activities/${act!.id}/submissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
        body: JSON.stringify({
          client_mutation_id: crypto.randomUUID(),
          activity_id: act!.id,
          content: 'Me encantó ese café',
          media_key: upB.media_key,
        }),
      },
      env
    )

    // GET /api/media/collages compila la semana en estado 'ready'
    const listRes = await app.request(
      '/api/media/collages',
      { method: 'GET', headers: { Cookie: userA.cookie } },
      env
    )
    expect(listRes.status).toBe(200)
    const listData = (await listRes.json()) as {
      items: Array<{
        id: string
        status: string
        media_key: string | null
        activities_count: number
        highlights: Array<{ my_content: string | null; partner_content: string | null }>
      }>
    }
    expect(listData.items).toHaveLength(1)
    expect(listData.items[0]!.status).toBe('ready')
    expect(listData.items[0]!.activities_count).toBe(1)
    expect(listData.items[0]!.highlights[0]!.my_content).toBe('Atardecer increíble')
    expect(listData.items[0]!.highlights[0]!.partner_content).toBe('Me encantó ese café')

    const collageId = listData.items[0]!.id

    // Subir PNG renderizado 1080x1920 y sellarlo con POST /api/media/collages/:id/render
    const collageUpload = await requestUploadAndPut(
      userA.cookie,
      'collage',
      'image/png',
      new TextEncoder().encode('png-collage-1080x1920')
    )

    const renderRes = await app.request(
      `/api/media/collages/${collageId}/render`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userA.cookie },
        body: JSON.stringify({ media_key: collageUpload.media_key }),
      },
      env
    )
    expect(renderRes.status).toBe(200)
    const renderData = (await renderRes.json()) as {
      status: string
      collage: { status: string; media_key: string }
    }
    expect(renderData.collage.status).toBe('rendered')
    expect(renderData.collage.media_key).toBe(collageUpload.media_key)

    // Partner B ve el collage ya renderizado y puede pedir view-url
    const listBRes = await app.request(
      '/api/media/collages',
      { method: 'GET', headers: { Cookie: userB.cookie } },
      env
    )
    const listBData = (await listBRes.json()) as { items: Array<{ status: string; media_key: string }> }
    expect(listBData.items[0]!.status).toBe('rendered')
    expect(listBData.items[0]!.media_key).toBe(collageUpload.media_key)

    // Otra pareja no puede sobrescribir el collage -> 403
    const otherUpload = await requestUploadAndPut(
      coupleOther.userA.cookie,
      'collage',
      'image/png',
      new TextEncoder().encode('intruder-png')
    )
    const intruderRes = await app.request(
      `/api/media/collages/${collageId}/render`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: coupleOther.userA.cookie },
        body: JSON.stringify({ media_key: otherUpload.media_key }),
      },
      env
    )
    expect(intruderRes.status).toBe(403)
  })
})
