# Fase 2 - Hito 1: feature/auth — Plan Canónico Definitivo de Producción (React 19, TanStack Router & Offline-First)

Plan maestro de implementación de la interfaz de autenticación para LazUs, adaptando el diseño de **Stitch / Google AI Studio** a **Vertical Slice Architecture** (`src/features/auth/components/`), integrando **TanStack Router con sincronización reactiva completa** (`router.invalidate()`), invariantes **offline-first** para apertura instantánea desde Dexie, protecciones de ruta declarativas con guardia ante `isLoading`, y gestión de verificación de correo adaptable según el estado de sesión.

---

## 1. Resoluciones Críticas de Estado Asíncrono, Guards y Offline-First

### 1.1 🔴 Re-evaluación de `beforeLoad` con `router.invalidate()` y Guards Seguros ante `isLoading`
Para neutralizar tanto el *falso redirect en el arranque* como el *bounce post-autenticación*:

1. **Guards Condicionados a `isLoading` (`src/router.tsx`)**:
   Los guards de ruta nunca toman decisiones destructivas mientras el estado de auth esté resolviendo:
   ```ts
   // En guestLayoutRoute (/login, /register, /forgot-password, /reset-password):
   beforeLoad: ({ context }) => {
     if (context.auth.isLoading) return // No decidir prematuramente durante carga inicial
     if (context.auth.isAuthenticated) {
       throw redirect({ to: '/' })
     }
   }

   // En authenticatedRoute (/ Dashboard):
   beforeLoad: ({ context }) => {
     if (context.auth.isLoading) return // No expulsar al usuario mientras Dexie/me resuelven
     if (!context.auth.isAuthenticated) {
       throw redirect({ to: '/login' })
     }
   }
   ```

2. **Invalidación Explícita del Router ante Cambios de Auth (`AppRouter`)**:
   En el componente contenedor que orquesta `<RouterProvider />`:
   ```tsx
   export function AppRouter() {
     const auth = useAuth()

     // Forzar la re-evaluación de los guards de la ruta actual cuando el estado de auth cambia
     useEffect(() => {
       router.invalidate()
     }, [auth.isAuthenticated, auth.isLoading])

     return <RouterProvider router={router} context={{ auth }} />
   }
   ```
   Esto asegura que:
   - Al resolverse la carga inicial, el router re-ejecuta `beforeLoad` y transiciona limpiamente a la pantalla definitiva.
   - Al hacer login o registro, el cambio de `auth.isAuthenticated` dispara `router.invalidate()`, permitiendo el acceso al dashboard sin rebotes.
   - Al hacer logout o expirar la cookie (401), el cambio de `auth.isAuthenticated` a `false` redirige de inmediato a `/login`.

3. **Raíz con Pantalla Splash Anti-Flicker (`RootComponent`)**:
   - En `createRootRouteWithContext<RouterContext>()`:
     - Mientras `context.auth.isLoading === true`, se renderiza `<AuthSplash />` (cintas `AmbientRibbons`, branding LazUs y pulso orgánico sutil).
     - Se garantiza **cero saltos visuales o parpadeos** entre pantallas durante la hidratación.

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
