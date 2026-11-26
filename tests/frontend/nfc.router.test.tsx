import { describe, expect, it } from 'vitest'
import type { AuthContextValue } from '../../src/features/auth/hooks/useAuth'
import { TapResolverPage } from '../../src/features/nfc'
import { router, tapRoute } from '../../src/router'

function createMockAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    hasResolvedInitialAuth: true,
    login: async () => {
      throw new Error('not implemented')
    },
    isLoggingIn: false,
    loginError: null,
    register: async () => {
      throw new Error('not implemented')
    },
    isRegistering: false,
    registerError: null,
    logout: async () => {},
    isLoggingOut: false,
    ...overrides,
  }
}

describe('NFC Router Guard & Zero Web-NFC Invariants - Fase 3', () => {
  it('registra /tap/$tagId en el árbol de rutas sin depender de Web NFC API (NDEFReader)', () => {
    expect(TapResolverPage).toBeDefined()
    expect(tapRoute.options.path).toBe('/tap/$tagId')
    expect('NDEFReader' in globalThis).toBe(false)
    expect(router.routesByPath['/tap/$tagId']).toBeDefined()
  })

  it('no redirige prematuramente mientras hasResolvedInitialAuth es false (0 flickers)', () => {
    const beforeLoad = tapRoute.options.beforeLoad
    expect(beforeLoad).toBeTypeOf('function')

    expect(() =>
      beforeLoad?.({
        context: {
          auth: createMockAuth({
            hasResolvedInitialAuth: false,
            isAuthenticated: false,
          }),
        },
        params: { tagId: 'TAG-HYDRATING' },
      } as never)
    ).not.toThrow()
  })

  it('redirige a /login?redirect=/tap/:tagId cuando la sesión no está autenticada', () => {
    const beforeLoad = tapRoute.options.beforeLoad
    let thrownRedirect: unknown = null

    try {
      beforeLoad?.({
        context: {
          auth: createMockAuth({
            hasResolvedInitialAuth: true,
            isAuthenticated: false,
          }),
        },
        params: { tagId: 'PULSERA-777' },
      } as never)
    } catch (err) {
      thrownRedirect = err
    }

    expect(thrownRedirect).toBeTruthy()
    const redirectObj = thrownRedirect as { options?: { to?: string; search?: { redirect?: string } } }
    expect(redirectObj.options?.to).toBe('/login')
    expect(redirectObj.options?.search?.redirect).toBe('/tap/PULSERA-777')
  })
})
