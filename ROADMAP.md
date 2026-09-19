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
3. **Actividades Diarias:** **Catálogo curado por el sistema**. Cada reto define su formato de respuesta (solo texto, solo foto, o mixto) según la temática del día.
4. **Persistencia y Recuerdos:** Las respuestas diarias son dinámicas. Al finalizar cada semana, el sistema genera automáticamente un **Collage Semanal** con los momentos y fotos destacadas de la pareja, listo para guardarse en su álbum privado y compartirse en redes sociales (estilo Yope/BeReal).
5. **Toques de Afecto NFC:** **Toque único instantáneo** (vibración háptica + corazón directo al aproximar el móvil a la pulsera).
   - *Nota de producto:* ⚠️ **Revisar a futuro:** Evaluar si añadir un menú de reacciones adicionales (beso, abrazo, etc.).

---

## 🗺️ Hitos de Desarrollo (Vertical Slices)

```text
[ ] Hito 1: Autenticación Híbrida y Sesión (feature/auth)
[ ] Hito 2: Emparejamiento de Pareja y NFC Linking (feature/couple)
[ ] Hito 3: Catálogo de Actividades y Blind Reveal (feature/activities)
[ ] Hito 4: Tiempo Real con Durable Objects (feature/realtime)
[ ] Hito 5: Rutas NFC y Toque de Afecto Háptico (feature/nfc)
[ ] Hito 6: Almacenamiento en R2 y Collage Semanal (feature/media)
[ ] Hito 7: Notificaciones Web Push (feature/notifications)
```

---

### [🔄] Hito 1: Autenticación Híbrida y Gestión de Sesión (`feature/auth`)

**Objetivo:** Permitir a los usuarios registrarse e iniciar sesión de forma segura sin coste de licencias, manteniendo su sesión activa de forma persistente y resiliente offline.

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
- [x] **Suite Exhaustiva de Pruebas Automatizadas:** 16 suites y 56 tests pasando (100% éxito) con Vitest en modo secuencial (`fileParallelism: false`).

#### ⏳ Fase 2: Componentes UI Visuales e Integración (OBJETIVO ACTUAL)
- [ ] **Integración de Componentes Diseñados en Stitch / Google AI Studio:**
  - Adaptar y organizar el código exportado dentro de la arquitectura vertical `src/features/auth/components/`.
  - Formularios modulares: `AuthCard`, `LoginForm`, `RegisterForm`, `GoogleAuthButton`, `ForgotPasswordModal`, `VerifyEmailPage`.
- [ ] **Conexión Reactiva con Lógica de Dominio:**
  - Conectar formularios a los contratos Zod (`RegisterInputSchema`, `LoginInputSchema`, etc.).
  - Integración fluida con el hook `useAuth` (`login`, `register`, `logout`) y cliente `authApi`.
- [ ] **Feedback Visual & Manejo de Errores:**
  - Visualización amigable de errores de negocio, tiempos de espera por rate limiting (`Retry-After`) y estados de carga (`isLoggingIn`, `isRegistering`).
- [ ] **Micro-interacciones y Diseño Móvil Háptico:**
  - Transiciones suaves con Framer Motion, diseño mobile-first responsivo y estética íntima con TailwindCSS v4.

---

### [ ] Hito 2: Emparejamiento de Pareja y Vinculación NFC (`feature/couple`)

**Objetivo:** Conectar a los dos miembros de la relación en una entidad única `couple_id` mediante su pulsera física o un enlace de invitación.

#### Criterios de Aceptación:
- [ ] **Generación de Invitación:**
  - Usuario A genera un enlace/código de invitación único (`/link/:tagId` o código de 6 caracteres).
  - La URL puede grabarse físicamente en la pulsera NFC o enviarse por WhatsApp/mensajería.
- [ ] **Aceptación e Idempotencia:**
  - Usuario B abre el enlace y ve una pantalla de confirmación: *"¿Deseas vincular tu cuenta con [Nombre de A]?"*.
  - Al aceptar, la base de datos ejecuta una transacción atómica:
    - Crea la fila en `couples`.
    - Inserta exactamente 2 miembros en `couple_members` (`partner_a`, `partner_b`).
  - Si el enlace ya fue reclamado o expiró, responde con error claro y controlado.
- [ ] **Persistencia Local:**
  - Guardar el estado de la pareja en Dexie (`couple` table) para acceso instantáneo.
- [ ] **Tests:** Pruebas unitarias de la transacción de vinculación impidiendo que un usuario pertenezca a dos parejas activas a la vez.

---

### [ ] Hito 3: Catálogo de Actividades y Mecánica Blind Reveal (`feature/activities`)

**Objetivo:** Implementar la experiencia central de la app: pregunta diaria del sistema y revelación bloqueada hasta que ambos completen su parte.

#### Criterios de Aceptación:
- [ ] **Banco de Actividades del Sistema:**
  - Tabla de actividades predefinidas con soporte para tipos de respuesta: `text_only`, `photo_only`, `both`.
  - Selector automático de la actividad diaria según la fecha lógica local de la pareja.
- [ ] **Los 3 Estados Visuales en la PWA:**
  - **Estado A (Pendiente):** Muestra el prompt del día y el formulario correspondiente (input de texto y/o selector de foto).
  - **Estado B (Esperando):** Respuesta guardada localmente en Outbox y en PostgreSQL. Pantalla con micro-animación emocional: *"Respuesta guardada ❤️. Esperando a tu pareja..."*.
  - **Estado C (Revelado):** Ambos completaron $\rightarrow$ Animación de revelación y visualización de ambas respuestas lado a lado.
- [ ] **Regla Zero-Leak (Invariante de Seguridad):**
  - La consulta SQL física **omite** el texto/foto de la pareja mientras la actividad no esté en estado `revealed`.
  - Prohibido filtrar o tapar datos en el cliente mediante JavaScript.
- [ ] **Tests:** Tests de integración que comprueben que la respuesta del partner no viaja en el JSON antes del reveal.

---

### [ ] Hito 4: Sincronización en Tiempo Real con Durable Objects (`feature/realtime`)

**Objetivo:** Conectar a los dos integrantes mediante WebSockets a coste $0/mes para una reactividad instantánea.

#### Criterios de Aceptación:
- [ ] **Durable Object por Pareja:**
  - 1 instancia de `CoupleDurableObject` por cada `couple_id`.
  - Implementación obligatoria de la **WebSocket Hibernation API** de Cloudflare para no consumir memoria mientras los sockets estén inactivos.
- [ ] **Eventos Seguros en Tiempo Real:**
  - Emisión de `partner_completed`: actualiza la pantalla del compañero al instante sin exponer el contenido.
  - Emisión de `activity_ready_to_reveal`: desbloquea la animación de revelación en ambos móviles simultáneamente.
  - Emisión de `affection_received`: dispara animación y vibración háptica.
- [ ] **Reconexión Automática:**
  - El cliente en React restablece la conexión al recuperar la señal o volver de segundo plano (`visibilitychange`).

---

### [ ] Hito 5: Rutas NFC y Toque de Afecto Háptico (`feature/nfc`)

**Objetivo:** Dar vida a la pulsera física NFC resolviendo deep links con retroalimentación física.

#### Criterios de Aceptación:
- [ ] **Resolución Inmediata de Rutas `/tap/:tagId`:**
  - Al aproximar el teléfono a la pulsera, el sistema operativo abre el enlace.
  - La app lee el estado local de Dexie en menos de 50 ms y decide:
    - *Caso 1:* Si el usuario no ha respondido hoy $\rightarrow$ navega a la actividad diaria.
    - *Caso 2:* Si ya respondió y la pareja no $\rightarrow$ envía un toque de afecto en segundo plano.
    - *Caso 3:* Si ambos respondieron $\rightarrow$ abre la pantalla de resultados revelados.
- [ ] **Toque de Afecto Instantáneo:**
  - Animación de corazón flotante en pantalla.
  - Vibración háptica en el dispositivo móvil mediante `navigator.vibrate([40, 60, 40])`.
  - Registro del evento en `affection_events` con `client_mutation_id` para evitar duplicados por toques accidentales repetidos.

---

### [ ] Hito 6: Almacenamiento en R2 y Collage Semanal de Pareja (`feature/media`)

**Objetivo:** Manejar fotografías privadas a coste de transferencia $0 y generar el resumen semanal compartible.

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
