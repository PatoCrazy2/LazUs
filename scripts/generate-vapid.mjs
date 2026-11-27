#!/usr/bin/env node
/**
 * Generador de claves VAPID (P-256 / ES256) usando Web Crypto API nativo de Node.
 * Uso: pnpm run vapid:generate
 */

function encodeBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function main() {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )

  const rawPublic = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey))
  const jwkPrivate = await globalThis.crypto.subtle.exportKey('jwk', keyPair.privateKey)

  if (!jwkPrivate.d || rawPublic.byteLength !== 65 || rawPublic[0] !== 0x04) {
    throw new Error('Error generando el par de claves VAPID P-256')
  }

  const publicKey = encodeBase64Url(rawPublic)
  const privateKey = jwkPrivate.d

  console.log('# Claves VAPID generadas para LazUs Web Push')
  console.log('# Copia VAPID_PUBLIC_KEY y VAPID_SUBJECT a wrangler.jsonc / .dev.vars')
  console.log('# Guarda VAPID_PRIVATE_KEY únicamente en .dev.vars o como Cloudflare Secret (wrangler secret put VAPID_PRIVATE_KEY)')
  console.log('')
  console.log(`VAPID_PUBLIC_KEY="${publicKey}"`)
  console.log(`VAPID_PRIVATE_KEY="${privateKey}"`)
  console.log('VAPID_SUBJECT="mailto:hola@lazus.app"')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
