import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../server/features/auth/auth.crypto'

describe('PBKDF2 V8 CPU Benchmark', () => {
  it('debe computar 100,000 iteraciones de PBKDF2 dentro de límites razonables de CPU', async () => {
    const start = performance.now()
    const hash = await hashPassword('BenchmarkPass123!')
    const hashTime = performance.now() - start

    expect(hash).toBeTruthy()
    // En V8 en máquinas modernas, 100,000 iteraciones toman típicamente entre 30ms y 400ms
    expect(hashTime).toBeLessThan(1500)

    const verifyStart = performance.now()
    const valid = await verifyPassword('BenchmarkPass123!', hash)
    const verifyTime = performance.now() - verifyStart

    expect(valid).toBe(true)
    expect(verifyTime).toBeLessThan(1500)

    console.info(`[Benchmark] Hash time: ${hashTime.toFixed(2)}ms | Verify time: ${verifyTime.toFixed(2)}ms`)
  })
})
