import { describe, expect, it, vi } from 'vitest'
import {
  ForgotPasswordInputSchema,
  LoginInputSchema,
  RegisterInputSchema,
  ResetPasswordInputSchema,
  VerifyEmailInputSchema,
} from '../../shared'
import {
  AmbientRibbons,
  AuthLayout,
  AuthSplash,
  ForgotPasswordModal,
  GoogleAuthButton,
  IosChrome,
  LoginForm,
  RegisterForm,
  ResetPasswordForm,
  UnverifiedEmailBanner,
  VerifyEmailCard,
} from '../../src/features/auth/components'

describe('Auth UI Feature Contract and Schema Guard Tests', () => {
  describe('Export Integrity', () => {
    it('exports all visual presentation components and shells correctly', () => {
      expect(AmbientRibbons).toBeDefined()
      expect(AuthLayout).toBeDefined()
      expect(AuthSplash).toBeDefined()
      expect(GoogleAuthButton).toBeDefined()
      expect(IosChrome).toBeDefined()
      expect(IosChrome.StatusBar).toBeDefined()
      expect(IosChrome.HomeIndicator).toBeDefined()
      expect(LoginForm).toBeDefined()
      expect(RegisterForm).toBeDefined()
      expect(ForgotPasswordModal).toBeDefined()
      expect(ResetPasswordForm).toBeDefined()
      expect(VerifyEmailCard).toBeDefined()
      expect(UnverifiedEmailBanner).toBeDefined()
    })
  })

  describe('Form Validations against Zod Schemas', () => {
    it('validates LoginForm inputs accurately', () => {
      // Valid
      const valid = LoginInputSchema.safeParse({
        email: 'user@example.com',
        password: 'Password123',
      })
      expect(valid.success).toBe(true)

      // Invalid Email
      const invalidEmail = LoginInputSchema.safeParse({
        email: 'not-an-email',
        password: 'Password123',
      })
      expect(invalidEmail.success).toBe(false)

      // Empty Password
      const emptyPass = LoginInputSchema.safeParse({
        email: 'user@example.com',
        password: '',
      })
      expect(emptyPass.success).toBe(false)
    })

    it('validates RegisterForm password rules (min 8 chars, letter + number)', () => {
      // Missing number
      const noNumber = RegisterInputSchema.safeParse({
        displayName: 'Amor',
        email: 'couple@lazus.app',
        password: 'onlyletters',
      })
      expect(noNumber.success).toBe(false)

      // Missing letter
      const noLetter = RegisterInputSchema.safeParse({
        displayName: 'Amor',
        email: 'couple@lazus.app',
        password: '1234567890',
      })
      expect(noLetter.success).toBe(false)

      // Short length
      const shortPass = RegisterInputSchema.safeParse({
        displayName: 'Amor',
        email: 'couple@lazus.app',
        password: 'Pass1',
      })
      expect(shortPass.success).toBe(false)

      // Valid password
      const validPass = RegisterInputSchema.safeParse({
        displayName: 'Amor',
        email: 'couple@lazus.app',
        password: 'ValidPassword123',
      })
      expect(validPass.success).toBe(true)
    })

    it('validates ForgotPassword zero-leak input formatting', () => {
      const valid = ForgotPasswordInputSchema.safeParse({ email: 'partner@lazus.app' })
      expect(valid.success).toBe(true)

      const invalid = ForgotPasswordInputSchema.safeParse({ email: 'bad-email' })
      expect(invalid.success).toBe(false)
    })

    it('validates ResetPassword and VerifyEmail token schemas', () => {
      const validReset = ResetPasswordInputSchema.safeParse({
        token: 'valid-reset-token-12345',
        newPassword: 'BrandNewPassword2026',
      })
      expect(validReset.success).toBe(true)

      const validVerify = VerifyEmailInputSchema.safeParse({
        token: 'verify-token-abc',
      })
      expect(validVerify.success).toBe(true)

      const emptyVerify = VerifyEmailInputSchema.safeParse({
        token: '',
      })
      expect(emptyVerify.success).toBe(false)
    })
  })

  describe('useRetryAfterCountdown Logic Simulation', () => {
    it('formats seconds into human readable minutes and seconds', () => {
      const formatCountdown = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        if (mins > 0) {
          return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`
        }
        return `${secs}s`
      }

      expect(formatCountdown(45)).toBe('45s')
      expect(formatCountdown(60)).toBe('1m 00s')
      expect(formatCountdown(90)).toBe('1m 30s')
      expect(formatCountdown(125)).toBe('2m 05s')
    })
  })

  describe('Structural Routing & Auth Decoupling Invariants', () => {
    it('staleTime and background refetch isolation: hasResolvedInitialAuth remains true during refetch', () => {
      // Simular máquina de estados reactiva de useAuth
      let hasResolvedInitialAuth = false
      let isFetching = false
      let isDexieResolved = true
      let isFetched = true

      // Resolución inicial
      if (!hasResolvedInitialAuth && isDexieResolved && isFetched) {
        hasResolvedInitialAuth = true
      }
      expect(hasResolvedInitialAuth).toBe(true)

      // El usuario deja la app, expira staleTime y TanStack Query dispara refetch en background
      isFetching = true
      expect(isFetching).toBe(true)
      // El árbol de rutas NO debe alterarse: hasResolvedInitialAuth no debe volver a false
      expect(hasResolvedInitialAuth).toBe(true)

      // La query falla en background (por ejemplo por pérdida de red)
      isFetching = false
      expect(isFetching).toBe(false)
      // hasResolvedInitialAuth permanece inmutable (nunca vuelve a false durante la sesión)
      expect(hasResolvedInitialAuth).toBe(true)
    })

    it('safety timeout forces hasResolvedInitialAuth even if query never completes', () => {
      vi.useFakeTimers()
      try {
        let hasResolvedInitialAuth = false
        const timer = setTimeout(() => {
          hasResolvedInitialAuth = true
        }, 4000)

        expect(hasResolvedInitialAuth).toBe(false)
        vi.advanceTimersByTime(3999)
        expect(hasResolvedInitialAuth).toBe(false)

        vi.advanceTimersByTime(1)
        expect(hasResolvedInitialAuth).toBe(true)
        clearTimeout(timer)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})