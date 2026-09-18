# LazUs — Mobile-First PWA for Couples

> Intimate Progressive Web App designed exclusively for romantic couples with NFC physical interactions, offline-first data sync, and a Zero-Leak Blind Reveal mechanic.

---

## 1. Visión del Producto y Principios Clave

LazUs **no es** una red social ni una app de citas. Su propósito es fortalecer la conexión íntima de parejas mediante pequeñas dinámicas diarias y toques físicos:

- **Zero-Leak Blind Reveal:** Ninguno de los dos miembros de la pareja puede ver la respuesta del otro hasta que ambos hayan completado su participación en la actividad diaria.
- **Interacciones NFC Físicas:** Uso de pulseras o tags NFC mediante URLs estándar (`/tap/:tagId`, `/link/:tagId`) sin depender de Web NFC API (100% compatible con iOS y Android).
- **Offline-First & Alta Resiliencia:** La app abre instantáneamente y permite registrar respuestas sin conexión mediante Dexie (IndexedDB) y una cola Outbox tolerante a fallos.
- **Arquitectura Eficiente ($0/mes en free tier):** Cloudflare Workers + Durable Objects con WebSocket Hibernation + Neon PostgreSQL + Cloudflare R2.

---

## 2. Stack Tecnológico

| Capa | Tecnologías | Responsabilidad |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite, TypeScript | SPA PWA, micro-interacciones, animaciones móviles. |
| **Estilos & UI** | TailwindCSS v4, Framer Motion, Lucide | Interfaz íntima, moderna y háptica. |
| **Enrutamiento** | TanStack Router | Enrutamiento tipado y deep linking para NFC. |
| **Estado Remoto** | TanStack Query | Caching, reintentos y mutaciones optimistas. |
| **DB Local (Offline)** | Dexie.js (IndexedDB) | Persistencia local, velocidad y cola Outbox. |
| **Service Worker** | Workbox (VitePWA) | Precaching offline y Web Push Notifications. |
| **Backend API** | Hono | API edge ultraligera en Cloudflare Workers. |
| **Autenticación & Crypto** | Web Crypto API, Google OAuth 2.0 | PBKDF2 (100k iteraciones), PKCE, HMAC state, sesiones SHA-256. |
| **Servicio de Correo** | Resend | Verificación de email y reseteo de contraseñas no bloqueante. |
| **Base de Datos** | PostgreSQL (Neon en prod, Docker en dev) + Drizzle ORM | Verdad absoluta, integridad relacional y migraciones. |
| **Realtime** | Cloudflare Durable Objects | Sala WebSocket por pareja con WebSocket Hibernation API. |
| **Testing & CI** | Vitest (secuencial), GitHub Actions | Tests automatizados de integración y pipeline CI. |

---

## 3. Requisitos Previos

Asegúrate de tener instalados en tu máquina:
- **Node.js:** v20.x o v22.x LTS
- **pnpm:** v10.x (`npm install -g pnpm`)
- **Docker Desktop:** Activo para la base de datos PostgreSQL local
- **Git**

---

## 4. Guía Rápida para Levantar el Proyecto en Local

### 1. Clonar el repositorio y acceder a la carpeta
```bash
git clone https://github.com/TU_USUARIO/LazUs.git
cd LazUs
```

### 2. Instalar dependencias estrictas con `pnpm`
```bash
pnpm install
```

### 3. Configurar variables de entorno
Copia la plantilla de desarrollo:
```bash
cp .env.example .env.local
```
*(Para Cloudflare Workers en local, las variables ya se encuentran configuradas en `.dev.vars`).*

### 4. Iniciar la base de datos local con Docker
```bash
docker compose up -d
```
Verifica que el contenedor esté corriendo y saludable:
```bash
docker compose ps
```

### 5. Aplicar las migraciones de Base de Datos (Drizzle ORM)
Aplica las 11 tablas de dominio e índices en tu PostgreSQL local (usuarios, sesiones, tokens, rate limit, parejas, actividades, etc.):
```bash
pnpm run db:migrate
```

*(Opcional)* Abre **Drizzle Studio** para explorar las tablas visualmente en el navegador:
```bash
pnpm run db:studio
```

### 6. Ejecutar los Servidores de Desarrollo

#### Frontend (PWA en Vite):
```bash
pnpm run dev
```
Abre en tu navegador móvil o escritorio: `http://localhost:5173`.

#### Backend (Cloudflare Worker con Hono):
En otra terminal:
```bash
pnpm run dev:server
```
La API estará disponible en `http://localhost:8787`.

Prueba la conectividad real con la base de datos:
```bash
curl http://localhost:8787/api/health
```

---

## 5. Arquitectura de Autenticación y Seguridad (Hito 1: `feature/auth`)

La autenticación de LazUs sigue los estándares más estrictos de seguridad edge, privacidad y resiliencia offline:

- **Zero-Leak Data Transfer Object:** El endpoint `GET /api/auth/me` y los endpoints de sesión devuelven estrictamente un DTO seguro (`id`, `email`, `displayName`, `avatarUrl`, `emailVerified`, `hasPassword`), omitiendo en la capa de datos cualquier hash de contraseña o token.
- **Sesiones Criptográficas Hasheadas con Sliding Expiration:** Las cookies de sesión (`lazus_session`) se almacenan con hash SHA-256 en la tabla `sessions` con flags `HttpOnly`, `SameSite=Lax` y `Secure`. Si la sesión tiene menos de 7 días restantes, se renueva automáticamente por 30 días adicionales.
- **Prevención Integral de Toma de Cuentas (Caso B - Squatting):** Si un usuario inicia sesión con Google OAuth verificado sobre un correo previamente registrado pero no verificado (`email_verified = false`), el sistema de forma atómica:
  1. Transfiere la titularidad y marca `email_verified = true`.
  2. Anula la contraseña previa (`password_hash = NULL`).
  3. Revoca todas las sesiones activas del atacante o impostor.
  4. Purga todos los tokens de autenticación pendientes.
- **Verificación de Email Anti-Prefetching (`POST /api/auth/verify-email`):** Diseñado para evitar que escáneres de correo corporativo (Outlook Safe Links, Google Workspace) invaliden tokens mediante prefetching con `GET`. La verificación requiere interacción mutante del usuario vía `POST` y responde con la cabecera `Referrer-Policy: no-referrer`.
- **Rate Limiting Dual Atómico en PostgreSQL:** 
  - **Local (`ip:login:email`):** Máximo 5 intentos fallidos en 15 minutos por IP.
  - **Global (`email:login:<email>`):** Máximo 20 intentos fallidos acumulados en 1 hora independientemente de la IP (protección contra botnets y proxies rotativos).
- **Cuentas Híbridas y Reseteo con Orden Estricto:** Los usuarios creados con Google OAuth (`password_hash = NULL`) pueden usar `forgot-password` $\rightarrow$ `reset-password` para asignar contraseña. El reseteo sigue el orden estricto: validar token $\rightarrow$ actualizar hash $\rightarrow$ marcar token consumido $\rightarrow$ purgar sesiones previas $\rightarrow$ emitir nueva sesión.
- **Envío de Correo Resiliente (Resend):** Envíos no bloqueantes envueltos en `try/catch`. En caso de límites de sandbox o fallos de red, el registro y los tokens persisten en BD y se imprimen en logs en desarrollo sin quebrar la respuesta HTTP.
- **Mantenimiento Periódico (`cleanupExpiredAuthData`):** Tarea programada en Cloudflare Workers con Cron Trigger (`0 3 * * *`) que purga intentos de login inactivos (>24h), tokens caducados o consumidos, y sesiones expiradas dentro del free-tier ($0/mes).
- **Persistencia Local Offline (Dexie):** Al autenticarse, el perfil de usuario se sincroniza en la tabla `profile` de IndexedDB mediante `authStore`, permitiendo arranques en frío instantáneos sin conexión.

---

## 6. Tests Automatizados y Calidad de Código

El proyecto cuenta con una suite completa de pruebas unitarias, de integración, middleware y seguridad ejecutadas secuencialmente (`fileParallelism: false`) para garantizar aislamiento por `TRUNCATE`:

```bash
# Ejecutar la suite completa de tests (56 tests / 16 suites)
pnpm test

# Comprobar linter sin errores
pnpm run lint

# Validar tipado estricto de TypeScript y bundle de producción (PWA)
pnpm run build
```

### Matriz de Pruebas Implementada:
- **Helpers:** `tests/helpers/db.ts` (TRUNCATE en cascada y variables de entorno de prueba).
- **Unitarias:**
  - `tests/unit/auth.crypto.test.ts`: PBKDF2 (tolerancia a null), `timingSafeEqual`, HMAC-SHA256, SHA-256 tokens y PKCE RFC 7636.
  - `tests/unit/auth.cleanup.test.ts`: Purga periódica de intentos, tokens y sesiones caducadas.
  - `tests/unit/auth.benchmark.test.ts`: Benchmark de CPU para 100k iteraciones PBKDF2 en V8.
  - `tests/unit/auth.schema.test.ts`: Zod estricto, sanitización de emails y reglas de contraseñas.
  - `tests/unit/auth.store.test.ts`: Sincronización offline en IndexedDB con `fake-indexeddb`.
  - `tests/unit/schemas.test.ts`: Validación de contratos de dominio y outbox.
- **Middleware:**
  - `tests/middleware/auth.middleware.test.ts`: Tokens válidos/manipulados, sliding expiration y código 401.
- **API & Integración:**
  - `tests/api/auth.email.test.ts`: Register, login, concurrencia (409 Conflict), logout y endpoint `GET /me`.
  - `tests/api/auth.takeover.test.ts`: Neutralización atómica de squatting y revocación de sesiones (Caso B).
  - `tests/api/auth.google.test.ts`: Flujo PKCE, verificación de estado HMAC y UserInfo de Google.
  - `tests/api/auth.verify-email.test.ts`: Verificación mutante POST, Referrer-Policy y reenvío silencioso.
  - `tests/api/auth.password-reset.test.ts`: Recuperación de contraseña y orden estricto de purga.
  - `tests/api/auth.set-password.test.ts`: Asignación de contraseña y revocación de sesiones concurrentes.
  - `tests/api/auth.ratelimit.test.ts`: Rate limit dual por IP y anti-botnet por correo.
  - `tests/api/auth.transport.test.ts`: Flags de seguridad en cookies (HttpOnly, SameSite) y CORS.
  - `tests/api/health.test.ts`: Verificación de salud y conectividad real a PostgreSQL.

---

## 7. Estructura del Proyecto (Vertical Slice Architecture)

```text
LazUs/
├── .github/workflows/          # Pipeline CI de GitHub Actions
├── .agents/                    # Reglas y Skills del asistente IA
│   ├── rules/                  # Reglas del Blind Reveal, Offline y Arquitectura
│   └── skills/                 # Runbooks (/db-migrate, /feature-scaffold, etc.)
│
├── docs/plans/                 # Especificaciones técnicas canónicas (01_FEATURE_AUTH_SPEC.md)
├── drizzle/migrations/         # Migraciones SQL declarativas generadas
│
├── shared/                     # Código y contratos compartidos (Edge & Browser)
│   ├── schemas/                # Validaciones Zod: common y auth.schema.ts
│   └── index.ts                # Eventos WebSocket seguros y tipos DTO
│
├── server/                     # Backend Hono en Cloudflare Workers
│   ├── index.ts                # API Entrypoint con /api/health y scheduled handler
│   ├── db/                     # Conexión Drizzle y schema.ts autoritativo
│   └── features/               # Slices modulares de backend
│       ├── auth/               # crypto, email, repository, service, middleware, routes
│       ├── activities/         # submission y reglas de Blind Reveal
│       └── affection/          # eventos de afecto y toques NFC
│
├── src/                        # Frontend PWA (React + Vite)
│   ├── db/                     # Dexie.js local y motor Outbox con Dead-Letter Queue
│   ├── features/               # Slices modulares de frontend
│   │   ├── auth/               # api, store offline en Dexie y hook useAuth
│   │   ├── activities/         # hooks de envío y visualización
│   │   └── affection/          # hooks de toques hápticos y afecto
│   └── App.tsx                 # Shell móvil PWA con animaciones hápticas
│
├── tests/                      # Suite de tests automatizados (Vitest)
│   ├── helpers/                # TRUNCATE en cascada y mocks de entorno
│   ├── unit/                   # Tests unitarios (crypto, cleanup, benchmark, schemas, store)
│   ├── middleware/             # Tests de authMiddleware y sliding expiration
│   └── api/                    # Tests de integración Hono + PostgreSQL y seguridad
│
├── docker-compose.yml          # Contenedor PostgreSQL 16 local
├── wrangler.jsonc              # Configuración de Cloudflare Workers & SPA Assets
└── GEMINI.md                   # Directivas y reglas canónicas del proyecto
```

---

## 8. Referencias Canónicas

Para profundizar en las decisiones de diseño y arquitectura, consulta los documentos de especificación:
- [00_PROJECT_CONTEXT.md](00_PROJECT_CONTEXT.md): Identidad, tono emocional y modelo de dominio.
- [01_CORE_FLOWS.md](01_CORE_FLOWS.md): Flujos de onboarding, toques NFC y mecánica ciega.
- [02_STACK_AND_ARCHITECTURE.md](02_STACK_AND_ARCHITECTURE.md): Principios arquitectónicos y desacoplamiento.
- [03_DEPLOYMENT_AND_INFRA.md](03_DEPLOYMENT_AND_INFRA.md): Estrategia de despliegue $0/mes en Cloudflare.
- [docs/plans/01_FEATURE_AUTH_SPEC.md](docs/plans/01_FEATURE_AUTH_SPEC.md): Especificación técnica definitiva de autenticación (Hito 1).
- [GEMINI.md](GEMINI.md): Directivas inmutables para desarrollo con agentes IA.

