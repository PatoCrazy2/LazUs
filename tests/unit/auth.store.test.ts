import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { authStore } from '../../src/features/auth/store/auth.store'
import { db } from '../../src/db'

describe('Auth Dexie Offline Store (authStore)', () => {
  beforeEach(async () => {
    await db.profile.clear()
  })

  it('debe guardar el perfil del usuario autenticado en Dexie', async () => {
    await authStore.saveProfile(
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'alice@example.com',
        displayName: 'Alice Wonderland',
        avatarUrl: 'https://example.com/alice.png',
        emailVerified: true,
        hasPassword: true,
      },
      '22222222-2222-2222-2222-222222222222'
    )

    const profile = await authStore.getProfile()
    expect(profile).toBeDefined()
    expect(profile?.id).toBe('11111111-1111-1111-1111-111111111111')
    expect(profile?.email).toBe('alice@example.com')
    expect(profile?.displayName).toBe('Alice Wonderland')
    expect(profile?.coupleId).toBe('22222222-2222-2222-2222-222222222222')
    expect(profile?.emailVerified).toBe(true)
    expect(profile?.hasPassword).toBe(true)
  })

  it('debe actualizar el perfil preservando el coupleId si ya existía', async () => {
    await authStore.saveProfile(
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'alice@example.com',
        displayName: 'Alice',
        avatarUrl: null,
        emailVerified: false,
        hasPassword: false,
      },
      'couple-xyz'
    )

    // Actualización sin especificar coupleId
    await authStore.saveProfile({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'alice@example.com',
      displayName: 'Alice Updated',
      avatarUrl: 'https://example.com/new.png',
      emailVerified: true,
      hasPassword: true,
    })

    const updated = await authStore.getProfile()
    expect(updated?.displayName).toBe('Alice Updated')
    expect(updated?.coupleId).toBe('couple-xyz')
    expect(updated?.emailVerified).toBe(true)
  })

  it('debe limpiar el perfil local al hacer clearProfile', async () => {
    await authStore.saveProfile({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'alice@example.com',
      displayName: 'Alice',
      emailVerified: true,
      hasPassword: true,
    })

    let profile = await authStore.getProfile()
    expect(profile).toBeDefined()

    await authStore.clearProfile()
    profile = await authStore.getProfile()
    expect(profile).toBeUndefined()
  })
})
