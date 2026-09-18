import { describe, expect, it } from 'vitest'
import {
  RegisterInputSchema,
  LoginInputSchema,
  VerifyEmailInputSchema,
  ResendVerificationInputSchema,
  ForgotPasswordInputSchema,
  ResetPasswordInputSchema,
  SetPasswordInputSchema,
  AuthUserDtoSchema,
} from '../../shared'

describe('Auth Zod Schemas & Invariants', () => {
  describe('RegisterInputSchema', () => {
    it('debe aceptar payload válido y normalizar email con trim y lowercase', () => {
      const parsed = RegisterInputSchema.safeParse({
        email: '  Test.User@Example.COM  ',
        displayName: '  Alice Doe  ',
        password: 'Password123!',
      })
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.email).toBe('test.user@example.com')
        expect(parsed.data.displayName).toBe('Alice Doe')
      }
    })

    it('debe rechazar contraseña menor a 8 caracteres o sin números/letras', () => {
      expect(
        RegisterInputSchema.safeParse({
          email: 'test@example.com',
          displayName: 'Alice',
          password: 'short',
        }).success
      ).toBe(false)

      expect(
        RegisterInputSchema.safeParse({
          email: 'test@example.com',
          displayName: 'Alice',
          password: 'onlylettersnopassword',
        }).success
      ).toBe(false)

      expect(
        RegisterInputSchema.safeParse({
          email: 'test@example.com',
          displayName: 'Alice',
          password: '123456789012345',
        }).success
      ).toBe(false)
    })

    it('debe rechazar propiedades desconocidas (strict)', () => {
      const parsed = RegisterInputSchema.safeParse({
        email: 'test@example.com',
        displayName: 'Alice',
        password: 'Password123!',
        extra_field: 'hacker',
      })
      expect(parsed.success).toBe(false)
    })
  })

  describe('LoginInputSchema', () => {
    it('debe aceptar credenciales válidas y normalizar email', () => {
      const parsed = LoginInputSchema.safeParse({
        email: '  HELLO@WORLD.COM ',
        password: 'MyPassword1',
      })
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.email).toBe('hello@world.com')
      }
    })

    it('debe rechazar campos adicionales por strict()', () => {
      expect(
        LoginInputSchema.safeParse({
          email: 'test@example.com',
          password: 'pass',
          role: 'admin',
        }).success
      ).toBe(false)
    })
  })

  describe('VerifyEmailInputSchema', () => {
    it('debe aceptar token válido con trim', () => {
      const parsed = VerifyEmailInputSchema.safeParse({
        token: '   abc123token456   ',
      })
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.token).toBe('abc123token456')
      }
    })

    it('debe rechazar token vacío', () => {
      expect(VerifyEmailInputSchema.safeParse({ token: '' }).success).toBe(false)
      expect(VerifyEmailInputSchema.safeParse({ token: '   ' }).success).toBe(false)
    })
  })

  describe('ForgotPasswordInputSchema & ResendVerificationInputSchema', () => {
    it('debe validar email y normalizar a minúsculas', () => {
      const parsedForgot = ForgotPasswordInputSchema.safeParse({
        email: '  User@Example.COM ',
      })
      expect(parsedForgot.success).toBe(true)
      if (parsedForgot.success) {
        expect(parsedForgot.data.email).toBe('user@example.com')
      }

      const parsedResend = ResendVerificationInputSchema.safeParse({
        email: '  User@Example.COM ',
      })
      expect(parsedResend.success).toBe(true)
      if (parsedResend.success) {
        expect(parsedResend.data.email).toBe('user@example.com')
      }
    })
  })

  describe('ResetPasswordInputSchema', () => {
    it('debe exigir token y nueva contraseña robusta', () => {
      const parsed = ResetPasswordInputSchema.safeParse({
        token: 'raw_reset_token',
        newPassword: 'BrandNewPassword1',
      })
      expect(parsed.success).toBe(true)

      const invalid = ResetPasswordInputSchema.safeParse({
        token: 'raw_reset_token',
        newPassword: 'weak',
      })
      expect(invalid.success).toBe(false)
    })
  })

  describe('SetPasswordInputSchema', () => {
    it('debe permitir setear contraseña con o sin currentPassword', () => {
      const withoutCurrent = SetPasswordInputSchema.safeParse({
        newPassword: 'NewSecurePassword1',
      })
      expect(withoutCurrent.success).toBe(true)

      const withCurrent = SetPasswordInputSchema.safeParse({
        currentPassword: 'OldPassword123',
        newPassword: 'NewSecurePassword1',
      })
      expect(withCurrent.success).toBe(true)
    })
  })

  describe('AuthUserDtoSchema (Zero-Leak)', () => {
    it('debe validar estructura segura de usuario sin filtrar password_hash', () => {
      const user = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'user@example.com',
        displayName: 'John Doe',
        avatarUrl: null,
        emailVerified: true,
        hasPassword: true,
      }
      const parsed = AuthUserDtoSchema.safeParse(user)
      expect(parsed.success).toBe(true)
    })
  })
})
