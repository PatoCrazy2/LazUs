# Fase 2 - Hito 1: feature/auth — Plan Canónico Definitivo de Producción (React 19, TanStack Router & Offline-First)

Plan maestro de implementación de la interfaz de autenticación para LazUs, adaptando el diseño de **Stitch / Google AI Studio** a **Vertical Slice Architecture** (`src/features/auth/components/`), integrando **TanStack Router con sincronización reactiva completa** (`router.invalidate()`), invariantes **offline-first** para apertura instantánea desde Dexie, protecciones de ruta declarativas desacopladas de estados transitorios con `hasResolvedInitialAuth` y timeout de seguridad, y gestión de verificación de correo adaptable según el estado de sesión.

---

## 1. Resoluciones Críticas de Estado Asíncrono, Guards y Offline-First

### 1.1 🔴 Desacoplamiento Reactivo (`hasResolvedInitialAuth`), Anti-Loop Invariant y Timeout de Seguridad
Para neutralizar de raíz el *falso redirect en el arranque*, el *bucle de remontaje destructivo (590+ peticiones ante ECONNREFUSED/desconexión)* y el *bounce post-autenticación*:

1. **La Causa Raíz de TanStack Query v5**:
   En TanStack Query v5, `isLoading`/`isPending` permanece en `true` mientras `data` sea `undefined` (incluso tras recibir un error de red). Cualquier refetch en segundo plano o reintento de conexión vuelve a activar el estado de carga transitorio. Atar el montaje de `<Outlet />` o los guards de ruta a `isLoading` provoca que la pantalla de splash desmonte la vista del formulario, este pierda su estado, se vuelva a montar, dispare otro fetch y entre en un bucle infinito de 500+ peticiones.

2. **Resolución Determinista con `hasResolvedInitialAuth` (`useAuth.ts`)**:
   Se implementa una máquina de estados unidireccional:
   - `hasResolvedInitialAuth`: inicia en `false` y pasa a `true` tan pronto como la lectura de Dexie y la primera respuesta de `/api/auth/me` (éxito o error) finalizan.
   - **Invariante Inmutable:** Una vez que `hasResolvedInitialAuth` es `true`, **nunca vuelve a `false` durante toda la sesión de la app**, aun si `staleTime` expira o la query se refetchea en segundo plano.
   - **Timeout de Seguridad Anti-Splash Infinito (4s):** Si la red o el backend experimentan latencia severa o caída total, un temporizador de 4 segundos fuerza `hasResolvedInitialAuth = true`, desbloqueando la aplicación en modo offline/invitado. Al resolver normalmente antes de los 4s, se invoca `clearTimeout` en el cleanup para evitar timers huérfanos en memoria.

3. **Guards Condicionados a `hasResolvedInitialAuth` (`src/router.tsx`)**:
   Los guards de ruta posponen cualquier decisión hasta que la resolución inicial esté completada:
   ```ts
   // En guestLayoutRoute (/login, /register, /forgot-password, /reset-password):
   beforeLoad: ({ context }) => {
     if (!context.auth.hasResolvedInitialAuth) return // Esperar resolución inicial determinista
     if (context.auth.isAuthenticated) {
       throw redirect({ to: '/' })
     }
   }

   // En authenticatedRoute (/ Dashboard):
   beforeLoad: ({ context }) => {
     if (!context.auth.hasResolvedInitialAuth) return // No expulsar al usuario durante el arranque
     if (!context.auth.isAuthenticated) {
       throw redirect({ to: '/login' })
     }
   }
   ```

4. **Invalidación Aislada del Router (`AppRouter`)**:
   `router.invalidate()` se suscribe exclusivamente a cambios en la autenticación real:
   ```tsx
   export function AppRouter() {
     const auth = useAuth()

     useEffect(() => {
       router.invalidate()
     }, [auth.isAuthenticated, auth.hasResolvedInitialAuth])

     return <RouterProvider router={router} context={{ auth }} />
   }
   ```
   Las fluctuaciones de `isFetching` o la expiración de `staleTime` no disparan la reevaluación destructiva de rutas.

5. **Raíz con Montaje Estable del Outlet (`RootComponent`)**:
   - Mientras `!context.auth?.hasResolvedInitialAuth`, se renderiza `<AuthSplash />`.
   - Una vez resuelto, el `<Outlet />` se monta permanentemente y nunca se desmonta por fluctuaciones de red o refetches.

---

### 1.2 🟡 Invariante Offline-First: `isAuthenticated` no depende de la red
En cumplimiento estricto con el documento de arquitectura (`02_STACK_AND_ARCHITECTURE.md` y `GEMINI.md`):
- **La aplicación abre instantáneamente desde Dexie**.
- En `useAuth.ts`:
  - `isAuthenticated` se evalúa positivamente en cuanto se detecta un perfil en la tabla `profile` de Dexie.
  - La llamada HTTP `GET /api/auth/me` se ejecuta en segundo plano para sincronizar cambios y refrescar el sliding expiration de la cookie de sesión.
  - **Manejo de Errores de Red:** Si `GET /api/auth/me` falla por falta de conectividad (offline, fallo DNS, timeout, `TypeError: Failed to fetch`), **no se altera el estado local ni se expulsa al usuario**. El usuario permanece `isAuthenticated: true` consumiendo los datos locales de Dexie.
  - **Única Causa de Revocación:** Solo un error HTTP `401 Unauthorized` explícito del servidor provoca la limpieza de Dexie (`authStore.clearProfile()`) y establece `isAuthenticated: false`.

---

### 1.3 🟡 `/verify-email` como Ruta de Acceso Dual & Manejo de Tokens Inválidos
- `/verify-email` se ubica fuera de `guestLayoutRoute` para permitir el acceso tanto a usuarios con sesión activa como sin sesión.
- **Caso A (Token válido):**
  - Si está autenticado: actualiza `emailVerified: true` en Dexie y muestra botón *"Continuar a nuestro espacio"* que navega a `/`.
  - Si no está autenticado: muestra botón *"Iniciar sesión"* hacia `/login`.
- **Caso B (Token inválido o expirado):**
  - **Si el usuario está autenticado:** El componente conoce su email por la sesión activa (`user.email`). Muestra:
    *"Este enlace ha expirado o ya fue utilizado. ¿Deseas recibir uno nuevo en {user.email}?"*
    Con un botón directo: *"Reenviar nuevo enlace"* (ejecuta `authApi.resendVerification({ email: user.email })` en 1 solo clic sin pedirle escribir el correo) y botón secundario *"Ir a mi espacio"*.
  - **Si el usuario NO está autenticado:** Ofrece un campo de entrada para ingresar su correo y solicitar un nuevo enlace de verificación.

---

### 1.4 🟢 Purga Sincronizada del Token con TanStack Router
- En `ResetPasswordForm`, el token se captura en memoria al montar y se limpia de la barra de direcciones usando la API del router:
  ```ts
  void navigate({ to: '/reset-password', search: {}, replace: true })
  ```
  El historial y el estado interno del router permanecen sincronizados sin fugas de tokens en URL o analítica.

---

### 1.5 🟢 Flujo Post-Registro
- Al completarse `registerMutation`, `RegisterForm` navega a `/` (`navigate({ to: '/' })`).
- El usuario accede al dashboard con `UnverifiedEmailBanner` en la cabecera permitiendo reenvío y recordando la confirmación.

---

### 1.6 🟢 Google OAuth Nativo
- `GoogleAuthButton` realiza `window.location.href = '/api/auth/google'`, permitiendo que el navegador procese nativamente la redirección 302 y las cookies.

---

### 1.7 🟢 Detección Dual de Standalone PWA
- En `IosChrome.tsx`:
  ```ts
  const isStandalone =
    (typeof window !== 'undefined' && (window.navigator as any).standalone === true) ||
    (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches)
  ```
  Oculta la barra simulada en iOS standalone y Android/Desktop PWA respetando `pt-safe`.

---

### 1.8 🟢 Hook Centralizado `useRetryAfterCountdown`
- Creado en `src/features/auth/hooks/useRetryAfterCountdown.ts` y compartido entre todos los formularios con rate limiting (429).

---

### 1.9 🟢 Accesibilidad & `autoComplete="new-password"`
- Región `<div aria-live="polite" className="sr-only">`.
- Foco automático en el encabezado `<h1>` o primer input tras transiciones.
- Atributo `autoComplete="new-password"` en `newPassword` y `confirmPassword` de `ResetPasswordForm`.

---

## 2. Mapa Completo de Rutas en `src/router.tsx`

```text
rootRoute (createRootRouteWithContext<RouterContext>())
│   - Si context.auth.isLoading -> Renderiza <AuthSplash /> (Cero parpadeos)
│   - Si no -> Renderiza <Outlet />
│
├── guestLayoutRoute (Shell visual AuthLayout)
│   - beforeLoad: si auth.isLoading return; si auth.isAuthenticated -> redirect to '/'
│   ├── /login -> LoginForm
│   ├── /register -> RegisterForm
│   ├── /forgot-password -> ForgotPasswordModal
│   └── /reset-password -> ResetPasswordForm (con validateSearch: { token })
│
├── verifyEmailRoute (/verify-email)
│   - Shell visual AuthLayout
│   - Acceso dual (autenticado y no autenticado)
│   - validateSearch: { token }
│   - Anti-prefetching con <meta name="referrer" content="no-referrer" /> y botón POST
│   - Manejo inteligente de token expirado (reenvío en 1 clic si hay sesión activa)
│
└── authenticatedRoute (Dashboard íntimo)
    - beforeLoad: si auth.isLoading return; si !auth.isAuthenticated -> redirect to '/login'
    └── / -> DashboardPage (con UnverifiedEmailBanner, perfil, toques de afecto y logout)
```

---

## 3. Plan de Verificación

1. **Compilación de Tipos**:
   - `pnpm.cmd run build` (`tsc -b && vite build`) $\rightarrow$ 0 errores de tipado TypeScript y build PWA exitoso.
2. **Pruebas Automatizadas**:
   - `pnpm.cmd test tests/unit` $\rightarrow$ tests unitarios pasan.
   - Tests para `useRetryAfterCountdown` y los componentes (`tests/unit/auth.ui.test.tsx`).
3. **Verificación de Flujos en Servidor de Desarrollo**:
   - **Offline-First**: En DevTools (Network = Offline), verificar que la app arranca desde Dexie sin redirigir a `/login`.
   - **Transición sin parpadeo**: Verificar que durante la carga se muestra `<AuthSplash />` y transiciona suavemente.
   - **Guards reactivos**: Al cerrar sesión en el dashboard, el router invalida y transiciona a `/login` sin recargar la página.
   - **Verificación de correo**: Probar token válido e inválido tanto con sesión iniciada como sin sesión.
