# Hito 1: feature/auth — Especificación Técnica Definitiva y Blindada de Autenticación

> **Documento Canónico de Implementación para el Hito 1**  
> Workspace: `LazUs`  
> Ubicación: `docs/plans/01_FEATURE_AUTH_SPEC.md`

---

## 1. Alcance y Orden de Ejecución

1. **Fase 1 (Objetivo Actual - Backend, Persistencia Offline y Tests):**
   - Esquema PostgreSQL con Drizzle: `users`, `sessions`, `login_attempts`, `auth_tokens`.
   - Servicio de correo con **Resend** (modo sandbox `onboarding@resend.dev` / producción con dominio propio, envío no bloqueante ante fallos).
   - Prevención integral de toma de cuentas: verificación de email, transferencia de titularidad en Google OAuth con **limpieza de contraseña, revocación de sesiones y purga total de `auth_tokens` pendientes**.
   - Verificación de email protegida contra prefetching de escáneres (acción vía `POST /api/auth/verify-email`).
   - Flujo de recuperación y verificación: `verify-email`, `resend-verification`, `forgot-password` y `reset-password` (con orden de purga estricto y soporte para cuentas con `password_hash = NULL`).
   - Tarea de mantenimiento periódico (`cleanupExpiredAuthData`): purga de sesiones, tokens e intentos de login caducados mediante Cloudflare Cron Trigger (`0 3 * * *`).
   - Rate limiting atómico dual en PostgreSQL: por `IP+Email` (5 intentos/15 min) y por `Email` global (20 intentos/hora anti-botnet).
   - Criptografía Web Crypto: PBKDF2 (hashing tolerante a hash nulo), SHA-256 (hashing de tokens), HMAC-SHA256 (firma de cookies de estado OAuth), PKCE.
   - Google OAuth 2.0 con UserInfo endpoint (`email_verified === true`).
   - Middleware `authMiddleware` con sliding expiration y sesiones hasheadas.
   - Endpoint `set-password` con validación de contraseña previa y revocación de sesiones concurrentes.
   - Persistencia local offline en Dexie (`auth.store.ts` y hook `useAuth.ts`).
   - Suite exhaustiva de pruebas en Vitest configurada en modo secuencial (`fileParallelism: false`) con aislamiento por `TRUNCATE`.
2. **Fase 2 (Siguiente Paso):**
   - Componentes UI visuales (`AuthCard`, `LoginForm`, `RegisterForm`, `GoogleAuthButton`, `ForgotPasswordModal`, `VerifyEmailPage` con `<meta name="referrer" content="no-referrer">`) con React 19 y Framer Motion.

---

## 2. Decisiones de Seguridad y Robustez Definitivas

### 2.1 🔴 Prevención Integral de Toma de Cuentas (Caso B + Purga de `auth_tokens`)
- **Acción Atómica al Detectar Squatting (Caso B):**
  Cuando un usuario entra por Google con email verificado y existe una cuenta previa con `email_verified = false`:
  1. Se actualiza la titularidad: `email_verified = true` y se vincula `google_id`.
  2. **Se anula la contraseña previa:** `password_hash = NULL`.
  3. **Se revocan todas las sesiones activas:** `DELETE FROM sessions WHERE user_id = $userId`.
  4. **Se purgan todos los tokens de autenticación pendientes:** `DELETE FROM auth_tokens WHERE user_id = $userId AND used_at IS NULL`.

### 2.2 🟡 Protección contra Prefetching de Escáneres de Correo en Verificación
- **El Problema:** Escáneres corporativos (Outlook Safe Links, Google Workspace, antivirus) visitan automáticamente con `GET` los enlaces dentro de los correos para inspeccionar phishing.
- **Solución:**
  - El enlace del correo apunta a la ruta de la PWA: `https://app.example.com/verify-email?token=...`.
  - Esta pantalla presenta al usuario un botón: *"Confirmar mi correo"*.
  - Al interactuar el usuario, el cliente despacha:
    `POST /api/auth/verify-email` con payload `{ token: "..." }`.
  - Los escáneres automatizados nunca ejecutan `POST` mutantes.
  - Al procesar el `POST`: se consume el token en la BD (`used_at = NOW()`), se marca `email_verified = true` y se emite la respuesta con `Referrer-Policy: no-referrer`.

### 2.3 🟡 Rate Limiting Dual: Local (IP+Email) y Global (Email Anti-Botnet)
- **Nivel Local (`ip:login:email`):** Máximo 5 intentos fallidos en 15 minutos por IP.
- **Nivel Global (`email:login:<email>`):** Máximo 20 intentos fallidos acumulados en 1 hora independientemente de la IP (protección contra botnets y proxies rotativos).
- Al autenticar con éxito, se limpian ambos contadores en `login_attempts`.

### 2.4 🟢 Flujo `forgot-password` para Cuentas de Google (`password_hash = NULL`)
- Una cuenta registrada originalmente vía Google (que no tiene contraseña) **puede utilizar `forgot-password` $\rightarrow$ `reset-password`** para asignar una contraseña por primera vez.
- La posesión y control del correo electrónico verificado a través del token es la prueba de titularidad.
- Tras completar el reseteo, el usuario puede acceder indistintamente mediante Google OAuth o mediante Email/Password.

### 2.5 🟢 Orden Estricto de Ejecución en `reset-password`
1. **Validar token:** Verificar `token_hash`, `used_at IS NULL` y `expires_at > NOW()`.
2. **Hashear y actualizar contraseña:** `UPDATE users SET password_hash = $newHash WHERE id = $userId`.
3. **Marcar token como consumido:** `UPDATE auth_tokens SET used_at = NOW() WHERE id = $tokenId`.
4. **Invalidar TODAS las sesiones previas:** `DELETE FROM sessions WHERE user_id = $userId`.
5. **Crear y emitir nueva sesión:** Crear la sesión en `sessions` y adjuntar la cabecera `Set-Cookie` (`lazus_session`) en la respuesta HTTP.

### 2.6 🟢 Limpieza Automática Periódica (Cloudflare Cron Trigger & Servicio de Mantenimiento)
- Para evitar el crecimiento indefinido de registros obsoletos:
  - Función de mantenimiento `cleanupExpiredAuthData(db)`:
    ```sql
    DELETE FROM login_attempts WHERE last_attempt_at < NOW() - INTERVAL '24 hours';
    DELETE FROM auth_tokens WHERE expires_at < NOW() OR used_at IS NOT NULL;
    DELETE FROM sessions WHERE expires_at < NOW();
    ```
  - Configuración en `wrangler.jsonc`: Cloudflare Cron Trigger programado diariamente (`crons = ["0 3 * * *"]`), ejecutado sin coste en la capa gratuita.
  - Expuesto también mediante handler `scheduled` en el Worker.

### 2.7 🟢 Reenvío Silencioso en Cuentas Verificadas
- En `POST /api/auth/resend-verification`:
  - Si `email_verified === false`: invalida tokens previos y envía nuevo correo.
  - Si `email_verified === true`: **no reenvía correo ni genera token**, respondiendo el 200 genérico habitual (*"Si la cuenta existe y no está verificada, recibirás un nuevo enlace"*).

### 2.8 Resiliencia de Correo con Resend (Envío No Bloqueante)
- En `email.service.ts`, `sendVerificationEmail` y `sendPasswordResetEmail` se ejecutan dentro de bloques `try/catch`.
- Si Resend responde 403 (modo sandbox) o falla la red, se registra el log de error y la respuesta HTTP **no falla**. La cuenta y el token quedan guardados en la BD y el token se imprime en la consola de desarrollo.

### 2.9 Tolerancia a `password_hash = NULL` en `verifyPassword`
- Si `storedHash` es nulo o indefinido, `verifyPassword` retorna `false` de inmediato sin arrojar excepción ni provocar error 500. El login responde el 401 unificado.

### 2.10 Nota de Implementación para Fase 2 (Frontend): `<meta name="referrer">`
- En la página React `/verify-email`, se incluirá explícitamente:
  `<meta name="referrer" content="no-referrer" />`
  para garantizar que ningún recurso estático externo que cargue la página HTML reciba el token en la cabecera Referer antes de que el usuario pulse el botón de confirmación.

---

## 3. Esquema Drizzle (`server/db/schema.ts`)

```typescript
// Enums
export const tokenTypeEnum = pgEnum('auth_token_type', ['email_verification', 'password_reset'])

// 1. Usuarios
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  googleId: varchar('google_id', { length: 255 }).unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// 2. Sesiones
export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // SHA-256(raw_session_token)
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_sessions_user_id').on(t.userId),
    index('idx_sessions_expires_at').on(t.expiresAt),
  ]
)

// 3. Rate Limiting (Soporta claves 'ip:login:email', 'email:login:<email>', 'ip:register', 'ip:resend')
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identifier: varchar('identifier', { length: 255 }).unique().notNull(),
    attemptCount: integer('attempt_count').default(1).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_login_attempts_locked_until').on(t.lockedUntil),
  ]
)

// 4. Tokens de Autenticación
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(), // SHA-256
    type: tokenTypeEnum('type').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_auth_tokens_hash').on(t.tokenHash),
    index('idx_auth_tokens_user').on(t.userId),
  ]
)
```

---

## 4. Endpoints Expuestos en `auth.routes.ts`

| Método | Ruta | Protección | Función |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Rate Limit (IP) | Registra usuario (`emailVerified = false`), emite token, envía correo con Resend, crea sesión. |
| `POST` | `/api/auth/login` | Rate Limit (Dual: IP+Email y Email) | Valida credenciales con rate limiting atómico dual, crea sesión y emite cookie. |
| `POST` | `/api/auth/logout` | `authMiddleware` | Elimina la sesión en PostgreSQL y expira la cookie. |
| `GET` | `/api/auth/me` | `authMiddleware` | Retorna el perfil del usuario autenticado (Zero-Leak). |
| `POST` | `/api/auth/verify-email`| Pública (Anti-Prefetch) | Consume token de verificación vía `POST`, marca `emailVerified = true`, responde con `Referrer-Policy: no-referrer`. |
| `POST` | `/api/auth/resend-verification` | Rate Limit (IP) | Invalida tokens previos y envía nuevo correo si la cuenta no está verificada (silencioso si ya lo está). |
| `POST` | `/api/auth/forgot-password` | Rate Limit (IP) | Genera token de reseteo (incluso para cuentas con `password_hash = NULL`) y envía correo no bloqueante con Resend. |
| `POST` | `/api/auth/reset-password` | Pública | Valida token, actualiza contraseña, marca token usado, purga todas las sesiones previas y emite nueva sesión. |
| `POST` | `/api/auth/set-password`| `authMiddleware` | Asigna contraseña (valida `currentPassword` si existía) e invalida otras sesiones. |
| `GET` | `/api/auth/google` | Pública | Genera PKCE + state firmado con HMAC y redirige a Google. |
| `GET` | `/api/auth/google/callback` | Pública | Valida HMAC y state, canjea token en Google, valida `email_verified`, previene squatting (**anula contraseña, revoca sesiones y purga tokens previos**), vincula o crea usuario, emite cookie. |

---

## 5. Matriz Exhaustiva de Pruebas Automatizadas

```text
tests/
├── helpers/
│   └── db.ts                        # TRUNCATE en cascada y mocks seguros de Resend y Google
├── unit/
│   ├── auth.crypto.test.ts          # PBKDF2 (incluyendo hash nulo), constant-time compare, HMAC, SHA-256 tokens
│   ├── auth.cleanup.test.ts         # Purga de sesiones, tokens e intentos expirados (cleanupExpiredAuthData)
│   ├── auth.benchmark.test.ts       # Benchmark informativo de CPU en V8
│   ├── auth.schema.test.ts          # Zod strict, trim de strings, contraseñas válidas
│   └── auth.store.test.ts           # Sincronización con Dexie (fake-indexeddb)
├── middleware/
│   └── auth.middleware.test.ts      # Token válido/inválido/manipulado, sliding expiration, 401
└── api/
    ├── auth.email.test.ts           # Register, login, concurrencia, rollback atómico, zero-leak
    ├── auth.takeover.test.ts        # Test de seguridad: neutralización de squatting, limpieza de password, sesiones y tokens previos
    ├── auth.google.test.ts          # PKCE, mock UserInfo, state HMAC, email_verified=false, auto-linking
    ├── auth.verify-email.test.ts    # Verificación de email vía POST (anti-prefetch), token de un solo uso, reenvío y silencio si ya está verificado
    ├── auth.password-reset.test.ts  # Forgot-password, reset sobre cuenta con password_hash null, orden estricto de purga y nueva sesión
    ├── auth.set-password.test.ts    # Asignación de contraseña (con y sin anterior) y revocación de sesiones
    ├── auth.ratelimit.test.ts       # Rate limit dual (IP+Email y Email global anti-botnet), reseteo al expirar
    └── auth.transport.test.ts       # Set-Cookie flags (HttpOnly, Lax), Referrer-Policy y CORS restringido
```

---

## 6. Archivos Afectados en la Fase 1

### Dependencias
- `package.json`: añadir `resend` en dependencies y `fake-indexeddb` en devDependencies.

### Base de Datos
- `server/db/schema.ts`: añadir `emailVerified` en `users`, tablas `sessions`, `loginAttempts` y `authTokens`.
- Migración SQL `drizzle/migrations/0001_auth_system.sql`.

### Shared
- `shared/schemas/auth.schema.ts`: esquemas Zod estrictos.
- `shared/index.ts`: re-exportar contratos.

### Backend
- `server/features/auth/auth.crypto.ts`
- `server/features/auth/email.service.ts`
- `server/features/auth/auth.repository.ts`
- `server/features/auth/auth.service.ts`
- `server/features/auth/auth.middleware.ts`
- `server/features/auth/auth.routes.ts`
- `server/index.ts`: montar router, CORS con origen restringido, exportar handler `scheduled`.
- `.dev.vars` y `.env.example`: variables de Google OAuth, `AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

### Frontend & Offline
- `src/features/auth/api/auth.api.ts`
- `src/features/auth/store/auth.store.ts`
- `src/features/auth/hooks/useAuth.ts`
- `vite.config.ts`: proxy `/api` a `http://localhost:8787`.
- `vitest.config.ts`: configurar ejecución secuencial de tests (`fileParallelism: false`).
