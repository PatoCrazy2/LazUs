import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../../server/db'
import { couples, coupleMembers, nfcTags, coupleInvitations } from '../../server/db/schema'
import app from '../../server/index'
import { getTestEnv, truncateAuthTables } from '../helpers/db'
import { randomUUID } from 'crypto'

describe('Feature Couple - Hito 2 (Pairing & NFC)', () => {
  const env = getTestEnv()
  const db = getDb(env.DATABASE_URL)

  beforeEach(async () => {
    await truncateAuthTables(db)
  })

  // Helper para crear usuarios y extraer la cookie de sesión
  async function createUser(email: string, displayName: string) {
    const res = await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName, password: 'Password123!' }),
      },
      env
    )
    const setCookie = res.headers.get('set-cookie') || ''
    const cookie = setCookie.split(';')[0]
    const data = await res.json()
    return { cookie, user: (data as any).user }
  }

  it('1. JIT Auto-discovery de Tag: Resolver un identificador que no existe en BD devuelve { type: "nfc_tag", state: "unclaimed" }', async () => {
    const res = await app.request('/api/couple/resolve/NFC-VIRGIN', {}, env)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({
      identifier: 'NFC-VIRGIN',
      type: 'nfc_tag',
      state: 'unclaimed',
      owner: null,
    })
  })

  it('2. Inferencia de Código Inválido: Resolver código inexistente LZ-XXXX devuelve { type: "digital_invite", state: "invalid" }', async () => {
    const res = await app.request('/api/couple/resolve/LZ-A1B2', {}, env)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({
      identifier: 'LZ-A1B2',
      type: 'digital_invite',
      state: 'invalid',
      owner: null,
    })
  })

  it('3. Auto-claim de tag: POST /api/couple/claim-tag asocia el tag a owner_user_id = A', async () => {
    const { cookie, user: userA } = await createUser('a@example.com', 'Usuario A')
    
    const res = await app.request(
      '/api/couple/claim-tag',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ tag_identifier: 'TAG-MIO' }),
      },
      env
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('success')

    // Verify DB
    const tags = await db.select().from(nfcTags)
    expect(tags).toHaveLength(1)
    expect(tags[0].ownerUserId).toBe(userA.id)
  })

  it('4. Reconocimiento de tag propio: A consulta su propio tag -> state: "owned_by_me"', async () => {
    const { cookie } = await createUser('a@example.com', 'Usuario A')
    
    // Auto-claim
    await app.request(
      '/api/couple/claim-tag',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ tag_identifier: 'TAG-PROPIO' }),
      },
      env
    )

    // Resolve
    const res = await app.request(
      '/api/couple/resolve/TAG-PROPIO',
      {
        headers: { Cookie: cookie },
      },
      env
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.state).toBe('owned_by_me')
    expect(data.owner.display_name).toBe('Usuario A')
  })

  it('5. Detección de pareja: B consulta el tag de A -> state: "ready_to_pair" con datos de A', async () => {
    const { cookie: cookieA } = await createUser('a@example.com', 'Usuario A')
    const { cookie: cookieB } = await createUser('b@example.com', 'Usuario B')
    
    await app.request(
      '/api/couple/claim-tag',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ tag_identifier: 'TAG-DE-A' }),
      },
      env
    )

    const res = await app.request(
      '/api/couple/resolve/TAG-DE-A',
      {
        headers: { Cookie: cookieB },
      },
      env
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.state).toBe('ready_to_pair')
    expect(data.owner.display_name).toBe('Usuario A')
  })

  it('6. Vinculación Atómica (1 Confirmación): B llama a POST /api/couple/pair con el tag de A', async () => {
    const { cookie: cookieA, user: userA } = await createUser('a@example.com', 'Usuario A')
    const { cookie: cookieB, user: userB } = await createUser('b@example.com', 'Usuario B')
    
    await app.request(
      '/api/couple/claim-tag',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ tag_identifier: 'TAG-LINK' }),
      },
      env
    )

    const clientId = randomUUID()
    const res = await app.request(
      '/api/couple/pair',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieB },
        body: JSON.stringify({ identifier: 'TAG-LINK', client_mutation_id: clientId }),
      },
      env
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.status).toBe('success')
    expect(data.couple_id).toBeTruthy()
    expect(data.partner.display_name).toBe('Usuario A')

    const dbCouples = await db.select().from(couples)
    expect(dbCouples).toHaveLength(1)

    const dbMembers = await db.select().from(coupleMembers)
    expect(dbMembers).toHaveLength(2)

    const dbTags = await db.select().from(nfcTags)
    expect(dbTags[0].coupleId).toBe(data.couple_id)
  })

  it('7. Idempotencia: Reintento con el mismo client_mutation_id devuelve 200 con la misma respuesta', async () => {
    const { cookie: cookieA } = await createUser('a@example.com', 'Usuario A')
    const { cookie: cookieB } = await createUser('b@example.com', 'Usuario B')
    
    await app.request(
      '/api/couple/claim-tag',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ tag_identifier: 'TAG-IDEM' }),
      },
      env
    )

    const clientId = randomUUID()
    const payload = JSON.stringify({ identifier: 'TAG-IDEM', client_mutation_id: clientId })

    // Llamada 1
    const res1 = await app.request(
      '/api/couple/pair',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieB }, body: payload },
      env
    )
    const data1 = await res1.json()

    // Llamada 2 (Reintento)
    const res2 = await app.request(
      '/api/couple/pair',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieB }, body: payload },
      env
    )
    const data2 = await res2.json()

    expect(res2.status).toBe(200)
    expect(data2).toEqual(data1)
    
    const dbCouples = await db.select().from(couples)
    expect(dbCouples).toHaveLength(1) // No se duplicó
  })

  it('8. Anti-autovinculación: A intenta vincularse consigo mismo -> 400 Bad Request', async () => {
    const { cookie: cookieA } = await createUser('a@example.com', 'Usuario A')
    
    await app.request(
      '/api/couple/claim-tag',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ tag_identifier: 'TAG-AUTO' }),
      },
      env
    )

    const res = await app.request(
      '/api/couple/pair',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ identifier: 'TAG-AUTO', client_mutation_id: randomUUID() }),
      },
      env
    )
    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error).toContain('Cannot pair with yourself')
  })

  it('9. Mapeo PG 23505 a 409 (Inviter ocupado): Si A ya tiene pareja, B es rechazado con 409 Conflict', async () => {
    const { cookie: cookieA } = await createUser('a@example.com', 'Usuario A')
    const { cookie: cookieB } = await createUser('b@example.com', 'Usuario B')
    const { cookie: cookieC } = await createUser('c@example.com', 'Usuario C')
    
    await app.request(
      '/api/couple/claim-tag',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieA }, body: JSON.stringify({ tag_identifier: 'TAG-A1' }) }, env
    )

    // A y C se vinculan
    await app.request(
      '/api/couple/pair',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieC }, body: JSON.stringify({ identifier: 'TAG-A1', client_mutation_id: randomUUID() }) }, env
    )

    // B intenta vincularse con A
    const res = await app.request(
      '/api/couple/pair',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieB }, body: JSON.stringify({ identifier: 'TAG-A1', client_mutation_id: randomUUID() }) }, env
    )
    expect(res.status).toBe(409)
  })

  it('10. Mapeo PG 23505 a 409 (Acceptor ocupado): Si B ya tiene pareja, es rechazado con 409 Conflict', async () => {
    const { cookie: cookieA } = await createUser('a@example.com', 'Usuario A')
    const { cookie: cookieB } = await createUser('b@example.com', 'Usuario B')
    const { cookie: cookieC } = await createUser('c@example.com', 'Usuario C')
    
    // B y C se vinculan (C usa un tag de B)
    await app.request(
      '/api/couple/claim-tag',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieB }, body: JSON.stringify({ tag_identifier: 'TAG-B1' }) }, env
    )
    await app.request(
      '/api/couple/pair',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieC }, body: JSON.stringify({ identifier: 'TAG-B1', client_mutation_id: randomUUID() }) }, env
    )

    // A reclama un tag e intenta vincularse a B (B trata de aceptar a A)
    await app.request(
      '/api/couple/claim-tag',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieA }, body: JSON.stringify({ tag_identifier: 'TAG-A2' }) }, env
    )
    
    const res = await app.request(
      '/api/couple/pair',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieB }, body: JSON.stringify({ identifier: 'TAG-A2', client_mutation_id: randomUUID() }) }, env
    )
    expect(res.status).toBe(409)
  })

  it('11. Respaldo Digital: Generación de código LZ-XXXX, resolución y vinculación exitosa', async () => {
    const { cookie: cookieA, user: userA } = await createUser('a@example.com', 'Usuario A')
    const { cookie: cookieB, user: userB } = await createUser('b@example.com', 'Usuario B')
    
    // A genera código
    const resGen = await app.request('/api/couple/invite-code', { method: 'POST', headers: { Cookie: cookieA } }, env)
    expect(resGen.status).toBe(200)
    const genData = (await resGen.json()) as any
    expect(genData.invitation_code).toMatch(/^LZ-[A-Z0-9]+$/)

    // B resuelve
    const resRes = await app.request(`/api/couple/resolve/${genData.invitation_code}`, { headers: { Cookie: cookieB } }, env)
    expect(resRes.status).toBe(200)
    const resData = (await resRes.json()) as any
    expect(resData.type).toBe('digital_invite')
    expect(resData.state).toBe('ready_to_pair')

    // B vincula
    const resPair = await app.request(
      '/api/couple/pair',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieB }, body: JSON.stringify({ identifier: genData.invitation_code, client_mutation_id: randomUUID() }) }, env
    )
    expect(resPair.status).toBe(200)

    const dbInvites = await db.select().from(coupleInvitations)
    expect(dbInvites).toHaveLength(1)
    expect(dbInvites[0].status).toBe('accepted')
    expect(dbInvites[0].acceptedByUserId).toBe(userB.id)
  })

  it('12. Aislamiento de Tests: Confirmar que truncateAuthTables purga nfc_tags y couple_invitations', async () => {
    // Al iniciar el test las tablas deben estar vacías
    const tags = await db.select().from(nfcTags)
    const invites = await db.select().from(coupleInvitations)
    expect(tags).toHaveLength(0)
    expect(invites).toHaveLength(0)
  })
})
