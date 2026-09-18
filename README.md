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
| **Base de Datos** | PostgreSQL (Neon en prod, Docker en dev) + Drizzle ORM | Verdad absoluta, integridad relacional y migraciones. |
| **Realtime** | Cloudflare Durable Objects | Sala WebSocket por pareja con WebSocket Hibernation API. |
| **Testing & CI** | Vitest, GitHub Actions | Tests automatizados de integración y pipeline CI. |

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
Aplica las 8 tablas de dominio en tu PostgreSQL local:
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

## 5. Tests Automatizados y Calidad de Código

Ejecutar la suite de tests automatizados (Vitest):
```bash
pnpm test
```

Comprobar linter:
```bash
pnpm run lint
```

Validar tipado estricto de TypeScript y empaquetado de producción:
```bash
pnpm run build
```

---

## 6. Estructura del Proyecto (Vertical Slice Architecture)

```text
LazUs/
├── .github/workflows/          # Pipeline CI de GitHub Actions
├── .agents/                    # Reglas y Skills del asistente IA
│   ├── rules/                  # Reglas del Blind Reveal, Offline y Arquitectura
│   └── skills/                 # Runbooks (/db-migrate, /feature-scaffold, etc.)
│
├── drizzle/migrations/         # Migraciones SQL declarativas generadas
│
├── shared/                     # Código y contratos compartidos (Edge & Browser)
│   ├── schemas/                # Validaciones Zod (Single Source of Truth)
│   └── index.ts                # Eventos WebSocket seguros y tipos DTO
│
├── server/                     # Backend Hono en Cloudflare Workers
│   ├── index.ts                # API Entrypoint con /api/health conectado a BD
│   ├── db/                     # Conexión Drizzle y schema.ts autoritativo
│   └── features/               # Slices modulares de backend (activities, affection)
│
├── src/                        # Frontend PWA (React + Vite)
│   ├── db/                     # Dexie.js local y motor Outbox con Dead-Letter Queue
│   ├── features/               # Slices modulares de frontend (activities, affection)
│   └── App.tsx                 # Shell móvil PWA con animaciones hápticas
│
├── tests/                      # Suite de tests automatizados (Vitest)
│   ├── api/                    # Tests de integración Hono + PostgreSQL
│   └── unit/                   # Tests unitarios de contratos Zod y lógica
│
├── docker-compose.yml          # Contenedor PostgreSQL 16 local
├── wrangler.jsonc              # Configuración de Cloudflare Workers & SPA Assets
└── GEMINI.md                   # Directivas y reglas canónicas del proyecto
```

---

## 7. Referencias Canónicas

Para profundizar en las decisiones de diseño y arquitectura, consulta los documentos de especificación:
- [00_PROJECT_CONTEXT.md](00_PROJECT_CONTEXT.md): Identidad, tono emocional y modelo de dominio.
- [01_CORE_FLOWS.md](01_CORE_FLOWS.md): Flujos de onboarding, toques NFC y mecánica ciega.
- [02_STACK_AND_ARCHITECTURE.md](02_STACK_AND_ARCHITECTURE.md): Principios arquitectónicos y desacoplamiento.
- [03_DEPLOYMENT_AND_INFRA.md](03_DEPLOYMENT_AND_INFRA.md): Estrategia de despliegue $0/mes en Cloudflare.
- [GEMINI.md](GEMINI.md): Directivas inmutables para desarrollo con agentes IA.
