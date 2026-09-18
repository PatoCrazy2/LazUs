import { describe, expect, it } from 'vitest'
import {
  generatePkcePair,
  generateRandomToken,
  hashPassword,
  sha256Hash,
  signOAuthState,
  timingSafeEqual,
  verifyCodeChallenge,
  verifyOAuthState,
  verifyPassword,
} from '../../server/features/auth/auth.crypto'

describe('Web Crypto Utilities (auth.crypto)', () => {
  describe('timingSafeEqual', () => {
    it('debe retornar true para cadenas idénticas', () => {
      expect(timingSafeEqual('secret123', 'secret123')).toBe(true)
    })

    it('debe retornar false para cadenas distintas o de distinta longitud', () => {
      expect(timingSafeEqual('secret123', 'secret124')).toBe(false)
      expect(timingSafeEqual('short', 'longerstring')).toBe(false)
    })
  })

  describe('sha256Hash & generateRandomToken', () => {
    it('debe generar tokens aleatorios de longitud esperada', () => {
      const token = generateRandomToken(32)
      expect(token).toHaveLength(64)
      expect(/^[0-9a-f]{64}$/.test(token)).toBe(true)
    })

    it('debe calcular hash SHA-256 determinista en hexadecimal', async () => {
      const hash1 = await sha256Hash('hello-world')
      const hash2 = await sha256Hash('hello-world')
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64)
    })
  })

  describe('PBKDF2 Password Hashing & Invariante Null Hash (§2.9)', () => {
    it('debe hashear y verificar contraseñas correctamente', async () => {
      const password = 'SuperSecurePassword123!'
      const hash = await hashPassword(password)

      expect(hash.startsWith('pbkdf2:sha256:100000:')).toBe(true)

      const isValid = await verifyPassword(password, hash)
      expect(isValid).toBe(true)

      const isInvalid = await verifyPassword('WrongPassword123!', hash)
      expect(isInvalid).toBe(false)
    })

    it('debe tolerar password_hash = NULL / undefined de forma segura sin arrojar 500', async () => {
      expect(await verifyPassword('Password123!', null)).toBe(false)
      expect(await verifyPassword('Password123!', undefined)).toBe(false)
      expect(await verifyPassword('Password123!', '')).toBe(false)
      expect(await verifyPassword('Password123!', 'invalid-format-hash')).toBe(false)
    })
  })

  describe('HMAC-SHA256 OAuth State Signature', () => {
    const secret = 'super-secret-signing-key-for-oauth'

    it('debe firmar y verificar state correctamente', async () => {
      const payload = { userId: '123', nonce: 'abc', timestamp: 123456789 }
      const signed = await signOAuthState(payload, secret)

      expect(signed).toContain('.')

      const verified = await verifyOAuthState<typeof payload>(signed, secret)
      expect(verified).toEqual(payload)
    })

    it('debe rechazar state si la firma ha sido manipulada', async () => {
      const payload = { userId: '123' }
      const signed = await signOAuthState(payload, secret)

      const tampered = signed.slice(0, -4) + 'abcd'
      const verified = await verifyOAuthState(tampered, secret)
      expect(verified).toBeNull()

      const wrongSecret = await verifyOAuthState(signed, 'another-wrong-secret')
      expect(wrongSecret).toBeNull()
    })
  })

  describe('PKCE RFC 7636', () => {
    it('debe generar pares verifier y challenge y verificarlos con éxito', async () => {
      const { codeVerifier, codeChallenge } = await generatePkcePair()
      expect(codeVerifier).toBeTruthy()
      expect(codeChallenge).toBeTruthy()

      const isValid = await verifyCodeChallenge(codeVerifier, codeChallenge)
      expect(isValid).toBe(true)

      const isInvalid = await verifyCodeChallenge('wrong_verifier', codeChallenge)
      expect(isInvalid).toBe(false)
    })
  })
})
