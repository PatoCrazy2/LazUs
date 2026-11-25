# Roadmap del Producto — LazUs PWA

> **Hoja de Ruta Oficial y Criterios de Aceptación por Hitos**  
> Workspace: `LazUs`  
> Última actualización: Septiembre 2026

---

## 💡 Decisiones Clave de Negocio y Producto

1. **Autenticación:** Híbrido de **Email + Contraseña** y **Google OAuth**.
   - *Nota técnica:* Se prescinde de "Sign in with Apple" inicialmente para evitar el coste obligatorio de \$99 USD/año del Apple Developer Program. Google OAuth es 100% gratuito en Google Cloud.
2. **Emparejamiento:** Híbrido (Tag NFC físico + Enlace/Código digital de respaldo).
   - *Nota de producto:* ⚠️ **Revisar a futuro:** Analizar si hacer el emparejamiento 100% exclusivo con la pulsera física NFC aumenta la tasa de conversión y el atractivo comercial como producto físico ("hardware-enabled intimacy").
3. **Actividades Diarias:** **Catálogo curado por el sistema** organizado en 3 ejes ortogonales (**Tema/Categoría** con color e ícono propios, **Tono** y **Ocasión**, incluyendo fechas especiales y aniversario) y múltiples formatos de respuesta (`text_only`, `choice`, `scale`, `prediction`, `music` vía iTunes Search API con portada HD + preview 30s + enlace externo, y formatos multimedia `photo_only`, `both`, `voice` respaldados por R2).
4. **Persistencia y Recuerdos:** Las respuestas diarias son dinámicas. Al finalizar cada semana, el sistema genera automáticamente un **Collage Semanal** con los momentos y fotos destacadas de la pareja, listo para guardarse en su álbum privado y compartirse en redes sociales (estilo Yope/BeReal).
5. **Toques de Afecto NFC:** **Toque único instantáneo** (vibración háptica + corazón directo al aproximar el móvil a la pulsera).
   - *Nota de producto:* ⚠️ **Revisar a futuro:** Evaluar si añadir un menú de reacciones adicionales (beso, abrazo, etc.).

---

## 🗺️ Hitos de Desarrollo (Vertical Slices)

```text
[x] Hito 1: Autenticación Híbrida y Sesión (feature/auth)
[x] Hito 2: Emparejamiento de Pareja y NFC Linking (feature/couple)
[x] Hito 3: Catálogo de Actividades y Blind Reveal (feature/activities)
[x] Hito 4: Tiempo Real con Durable Objects (feature/realtime)
[ ] Hito 5: Rutas NFC y Toque de Afecto Háptico (feature/nfc)
[ ] Hito 6: Almacenamiento en R2 y Collage Semanal (feature/media)
[ ] Hito 7: Notificaciones Web Push (feature/notifications)
```

---

### [✅] Hito 1: Autenticación Híbrida y Gestión de Sesión (`feature/auth`)

**Objetivo:** Permitir a los usuarios registrarse e iniciar sesión de forma segura sin coste de licencias, manteniendo su sesión activa de forma persistente y resiliente offline con estética de producción móvil.

#### ✅ Fase 1: Backend, Persistencia Offline y Tests (COMPLETADA)
- [x] **Esquema PostgreSQL con Drizzle:** Tablas `users`, `sessions`, `login_attempts`, `auth_tokens` con índices, migraciones y tipos.
- [x] **Criptografía Web Crypto Estándar:** PBKDF2 (100k iteraciones) con tolerancia a `password_hash = NULL`, PKCE (RFC 7636), firmas HMAC-SHA256 y hashing SHA-256 de tokens.
- [x] **Invariante Crítica de Seguridad (Anti-Squatting Caso B):** Transferencia atómica de titularidad al vincular Google, anulación de `password_hash = NULL`, revocación de todas las sesiones y purga total de `auth_tokens` pendientes.
- [x] **Anti-Prefetching de Escáneres:** Verificación mutante vía `POST /api/auth/verify-email` con cabecera `Referrer-Policy: no-referrer`.
- [x] **Rate Limiting Dual Atómico en PostgreSQL:** Límite local (`ip:login:email`, 5 intentos / 15 min) y global anti-botnet (`email:login:<email>`, 20 intentos / 1h).
- [x] **Recuperación y Reseteo con Orden Estricto:** Soporte de cuentas Google con `password_hash = NULL` y secuencia estricta: validar $\rightarrow$ hashear $\rightarrow$ consumir token $\rightarrow$ purgar sesiones previas $\rightarrow$ emitir nueva sesión.
- [x] **Resiliencia de Correo con Resend:** Envíos no bloqueantes envueltos en `try/catch` con fallback a consola en desarrollo.
- [x] **Mantenimiento Periódico:** Tarea `cleanupExpiredAuthData` expuesta para Cloudflare Cron Trigger (`0 3 * * *`).
- [x] **Middleware de Sesión:** `authMiddleware` con sesiones hasheadas en BD y sliding expiration (+30 días si restan $<7$ días).
- [x] **Persistencia Offline (Dexie):** Tabla local `profile` sincronizada vía `authStore` y hook reactivo `useAuth`.
- [x] **Suite Exhaustiva de Pruebas Automatizadas:** 17 suites y 64 tests pasando (100% éxito) con Vitest en modo secuencial (`fileParallelism: false`) incluyendo pruebas de aislamiento ante `staleTime` y timeout de seguridad.

#### ✅ Fase 2: Componentes UI Visuales, Integración y PWA Shell (COMPLETADA)
- [x] **Enrutamiento Tipado y Guards Desacoplados (TanStack Router):**
  - Implementación de `src/router.tsx` con rutas públicas (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`) y privadas protegidas (`/`).
  - Guards desacoplados de `isLoading` gobernados determinísticamente por `hasResolvedInitialAuth` y timeout de seguridad de 4s.
- [x] **Conexión Reactiva con Lógica de Dominio:**
  - Conexión de formularios a contratos Zod (`RegisterInputSchema`, `LoginInputSchema`, etc.) y cliente tipado `authClient`.
  - Integración con el hook `useAuth` (`login`, `register`, `logout`) y persistencia sincronizada en Dexie.
- [x] **Feedback Visual & Manejo de Errores:**
  - Visualización reactiva de errores de negocio, banner de email sin verificar (`UnverifiedEmailBanner`), pantalla dual de verificación (`VerifyEmailCard`) y temporizador de cuenta regresiva por rate limiting 429 (`Retry-After`).
- [x] **Restauración Visual 100% Fiel de Diseños Stitch / Google AI Studio:**
  - Fondo blanco puro (`#FFFFFF`), tipografía `#18181B`, ambient ribbons generativos SVG flotantes (`#FF5C7A`, `#8B5CF6`) con línea punteada adaptativa solo desktop/tablet (`hidden md:inline`).
  - Botón *specular* de grafito con highlight de 1px e inputs translúcidos con borde `#EAEAEA` y estados de foco limpios.
  - Botón de Google Auth translúcido con icono oficial multi-color.
  - Safe-areas móviles nativas (`pt-safe`, `pb-safe`, `viewport-fit=cover`) eliminando barras simuladas obsoletas.
  - Copys y placeholders optimizados: distinción estricta de registro de usuario individual ("Crea tu cuenta", "Crear cuenta") previo al emparejamiento, y placeholders consistentes (`tu@correo.com`, `Tu nombre`, `Tu contraseña`).
- [x] **Optimización de Metadatos PWA y Webmanifest para Producción:**
  - Idioma `<html lang="es">`, metadato moderno `<meta name="mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-title`, `format-detection="telephone=no"`, y sincronización de colores `#FFFFFF` en `vite.config.ts`.

---

### [✅] Hito 2: Emparejamiento de Pareja y Vinculación NFC (`feature/couple`)

**Objetivo:** Conectar a los dos miembros de la relación en una entidad única `couple_id` mediante su pulsera física o un enlace de invitación con UX de 1 confirmación y auto-asignación sin botones.

#### ✅ Fase 1: Backend, DB, Idempotencia y Tests (COMPLETADA)
- [x] **Contratos Zod Compartidos (`shared/schemas/couple.schema.ts`):** DTOs canónicos (`ResolveIdentifierResponseSchema`, `ClaimTagInputSchema`, `PairCoupleInputSchema`, `PairCoupleResponseSchema`, `CreateInviteCodeResponseSchema`, `CurrentCoupleResponseSchema`).
- [x] **Esquema PostgreSQL y Migración 0002:** Tabla `couple_invitations`, índices de rendimiento en `nfc_tags` (`idx_nfc_tags_owner`, `idx_nfc_tags_couple`) y migración declarativa aplicada.
- [x] **Middleware de Autenticación Opcional (`optionalAuthMiddleware`):** Permite inspeccionar tags y códigos de deep links anónimamente o identificando al usuario actual sin emitir 401.
- [x] **Auto-asignación JIT y Detección de Formato:** Inferencia inteligente en backend (`/^LZ-[A-Z0-9]{4,8}$/i`) para tags físicos vírgenes vs códigos digitales de respaldo sin pre-registro.
- [x] **Transacción Atómica de Vinculación con Bloqueo Concurrente:** Bloqueo `FOR UPDATE` en PostgreSQL, prevención de doble pareja (mapeo del error PG `23505` a `CoupleConflictError` $\rightarrow$ 409 Conflict), inserción de 2 miembros (`partner_a`, `partner_b`) y asociación de pulseras `nfc_tags`.
- [x] **Idempotencia en el Borde:** Registro de `client_mutation_id` en `idempotency_keys` para reintentos transparentes sin duplicación de parejas.
- [x] **Rutas Edge Hono (`/api/couple`):** Endpoints `/resolve/:identifier`, `/claim-tag`, `/pair`, `/current` y `/invite-code` montados y validados.
- [x] **Suite Exhaustiva de Tests de Integración:** 12 casos de prueba cubriendo auto-discovery, auto-claim, vinculación atómica, 409 Conflict, idempotencia, códigos digitales y purga en `tests/api/couple.pairing.test.ts`.

#### ✅ Fase 2: Frontend PWA, Store Dexie, Rutas TanStack y UI de Vinculación (COMPLETADA)
- [x] **Cliente API y Hooks TanStack Query (`couple.api.ts`, `useCouple.ts`):** Integración completa con `/api/couple/*`, mutaciones e invalidación atómica de `['auth', 'me']` y `['couple', 'current']`.
- [x] **Persistencia Local y Sincronización en Dexie (`couple.store.ts`):** Almacén `db.couple` para disponibilidad inmediata offline de la pareja y actualización de `db.profile`.
- [x] **Rutas y Deep Linking con TanStack Router (`router.tsx`):** Ruta dual `/link/$identifier` y preservación del search param `?redirect=` en Login, Register y Google OAuth (firmado en HMAC state).
- [x] **Flujo de Auto-claim Silencioso (`AutoClaimSuccess.tsx`):** Asignación automática de pulseras vírgenes en segundo plano sin botones y animación de celebración con Framer Motion.
- [x] **El Ritual de Unión (`PairingRitualScreen.tsx`):** Pantalla inmersiva a pantalla completa, validación estricta de conexión online (`navigator.onLine`), captura amigable de error 409 Conflict y celebración visual previa al dashboard.
- [x] **Respaldo Digital (`PairingSettingsModal.tsx`):** Generación de códigos `LZ-XXXX` de 24h, copia rápida al portapapeles y canje directo con validación de formato.

---

### [✅] Hito 3: Catálogo de Actividades y Mecánica Blind Reveal (`feature/activities`)

**Objetivo:** Implementar la experiencia central de la app: catálogo curado con 3 ejes (Tema, Tono, Ocasión), zona horaria por pareja, formatos interactivos y revelación bloqueada hasta que ambos completen su parte.

#### ✅ Criterios de Aceptación (COMPLETADA):
- [x] **Banco de Actividades del Sistema (3 Ejes) y Zona Horaria:**
  - Columna `timezone` (IANA, ej. `America/Mexico_City`) y `max_romance_intensity` en `couples` para calcular el `logical_date` exacto de la pareja sin desfase UTC.
  - Tabla `activity_prompts` con ejes separados:
    - `category` (Tema con color e ícono propios): `getting_to_know`, `memories`, `future`, `gratitude`, `life_values`, `music`, `romance`, `play`, `together_irl`, `daily_checkin`.
    - `tone`: `light`, `playful`, `tender`, `deep`.
    - `occasion`: `daily`, `special_date`, `long_distance` + soporte de `special_date` (`MM-DD` o `anniversary`) e `intensity` (`1..3`).
    - `response_type`: `text_only`, `choice`, `scale`, `prediction`, `music`, `photo_only`, `both`, `voice`, con `prompt_config` (`jsonb`).
  - `submissions` con `payload` (`jsonb`) inmutable (sellada al enviar) y vigencia diaria estricta.
  - Selector automático diario: prioridad a fechas especiales / aniversario, rotación sin repetir prompt ni categoría consecutiva.
- [x] **Formatos Interactivos en Hito 3 (y base lista para Hito 6):**
  - Funcionales en Hito 3: `text_only`, `choice` (opción múltiple), `scale` (check-in / emoji), `prediction` (respuesta + predicción de la pareja con puntaje al revelar) y `music` híbrido (buscador vía iTunes Search API con portada HD, preview de 30s en reproductor propio y enlace externo opcional).
  - Preparados en esquema/contrato para conectar R2 en Hito 6: `photo_only`, `both` y `voice` (notas de voz).
- [x] **Los 3 Estados Visuales en la PWA:**
  - **Estado A (Pendiente):** Chip de categoría (color + ícono), prompt del día y control interactivo según `response_type`.
  - **Estado B (Esperando):** Respuesta sellada localmente en Dexie/Outbox y en PostgreSQL. Pantalla con micro-animación emocional: *"Respuesta guardada ❤️. Esperando a tu pareja..."*.
  - **Estado C (Revelado):** Ambos completaron $\rightarrow$ Botón *"Tocar para revelar"*, animación de revelación, visualización lado a lado (incluyendo reproductor de preview 30s en `music` o puntaje en `prediction`) e historial revelado.
- [x] **Regla Zero-Leak (Invariante de Seguridad):**
  - La consulta SQL física **omite** el contenido/payload/media de la pareja mientras la actividad no esté en estado `revealed`.
  - Prohibido filtrar o tapar datos en el cliente mediante JavaScript.
- [x] **Tests:** Tests de integración que comprueben Zero-Leak, inmutabilidad (`409`), vigencia diaria, idempotencia (`client_mutation_id`), fechas especiales y desbloqueo atómico.

---

### [✅] Hito 4: Sincronización en Tiempo Real con Durable Objects (`feature/realtime`)

**Objetivo:** Conectar a los dos integrantes mediante WebSockets a coste $0/mes para una reactividad instantánea.

#### ✅ Criterios de Aceptación (COMPLETADA):
- [x] **Durable Object por Pareja:**
  - 1 instancia de `CoupleDurableObject` por cada `couple_id`.
  - Implementación obligatoria de la **WebSocket Hibernation API** de Cloudflare para no consumir memoria mientras los sockets estén inactivos (`acceptWebSocket`, `serializeAttachment`, `setWebSocketAutoResponse('ping', 'pong')`, migración `new_sqlite_classes`).
- [x] **Eventos Seguros en Tiempo Real:**
  - Emisión de `partner_submission_completed`: actualiza la pantalla del compañero al instante sin exponer el contenido.
  - Emisión de `activity_ready_to_reveal`: desbloquea la animación de revelación en ambos móviles simultáneamente.
  - Emisión de `affection_received`: dispara animación de corazón flotante y vibración háptica (`[40, 60, 40]`).
  - Emisión de `couple_paired` en sala de espera hibernada `user:<userId>` (con autolimpieza `close(1000)` + `deleteAll()`): actualiza al instante el teléfono del dueño de la pulsera/código con celebración háptica y transición determinista a la sala de pareja.
  - Indicador discreto de presencia (*"En línea"*) con soporte multi-pestaña.
- [x] **Reconexión Automática:**
  - El cliente en React restablece la conexión con backoff exponencial + jitter al recuperar la señal (`online`) o volver de segundo plano (`visibilitychange`).

---

### [✅] Hito 5: Rutas NFC y Toque de Afecto Háptico (`feature/nfc`)

**Objetivo:** Dar vida a la pulsera física NFC resolviendo deep links con retroalimentación física.

#### ✅ Criterios de Aceptación (COMPLETADA):
- [x] **Resolución Inmediata de Rutas `/tap/:tagId`:**
  - Al aproximar el teléfono a la pulsera, el sistema operativo abre el enlace (cero dependencia de Web NFC API).
  - La app lee el estado local de Dexie en menos de 50 ms y decide:
    - *Opción A (Sin pareja activa):* Redirige automáticamente a `/link/:tagId` para auto-claim o vinculación.
    - *Caso 1:* Si el usuario no ha respondido hoy $\rightarrow$ navega a la actividad diaria.
    - *Caso 2:* Si ya respondió y la pareja no $\rightarrow$ envía un toque de afecto en segundo plano (Outbox offline + reconexión automática).
    - *Caso 3:* Si ambos respondieron $\rightarrow$ abre directamente la pantalla de resultados revelados.
- [x] **Toque de Afecto Instantáneo:**
  - Animación de corazón flotante en pantalla (`FloatingHeartBurst` al enviar + `AffectionHeartOverlay` al recibir en vivo).
  - Vibración háptica en el dispositivo móvil mediante `navigator.vibrate([40, 60, 40])`.
  - Registro del evento en `affection_events` con `client_mutation_id` y ventana anti-rebote de 2 s para evitar duplicados por toques accidentales repetidos.

---

### [ ] Hito 6: Almacenamiento en R2 (Fotos, Notas de Voz) y Collage Semanal (`feature/media`)

**Objetivo:** Manejar fotografías y notas de voz privadas (`photo_only`, `both`, `voice`) a coste de transferencia $0 y generar el resumen semanal compartible.

#### Criterios de Aceptación:
- [ ] **Subida Directa a R2:**
  - Endpoint `POST /api/media/upload-url` que devuelve URLs prefirmadas válidas por 10 minutos.
  - El navegador sube la foto directamente a Cloudflare R2 sin saturar el Worker.
- [ ] **Visualización Privada:**
  - Bucket R2 estrictamente privado.
  - Enlaces de visualización generados con URLs firmadas de corta duración ($\le$ 15 min).
- [ ] **Generador del Collage Semanal:**
  - Al completar el ciclo semanal (ej. cada domingo), se compilan las fotos y mejores respuestas de la semana en una tarjeta visual estética (estilo Yope).
  - Los collages se conservan en la sección *"Nuestros Momentos"*.
  - Botón nativo para descargar la imagen o compartirla en Instagram Stories / WhatsApp mediante la `Web Share API`.

---

### [ ] Hito 7: Notificaciones Web Push (`feature/notifications`)

**Objetivo:** Mantener a la pareja comunicada cuando la PWA está cerrada o en segundo plano.

#### Criterios de Aceptación:
- [ ] **Suscripción VAPID:**
  - Generación de claves VAPID y registro del Service Worker en el cliente.
  - Almacenamiento de endpoints de suscripción por dispositivo en PostgreSQL.
- [ ] **Detección de Standalone en iOS:**
  - Detección de instalación previa en la pantalla de inicio antes de solicitar permisos push en Safari móvil.
- [ ] **Disparadores de Push:**
  - Notificación inmediata al recibir un toque de afecto (*"❤️ [Nombre] te envió un toque"*).
  - Notificación de dinamización diaria (*"✨ [Nombre] ya respondió al reto de hoy. ¡Descubre qué dijo!"*).
