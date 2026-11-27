import { Bell, CheckCircle2, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { IosStandaloneInstallGuide } from './IosStandaloneInstallGuide'

export interface ContextualPushPromptProps {
  partnerName?: string
  variant?: 'post_submission' | 'dashboard_soft'
}

const DISMISS_SESSION_KEY = 'lazus_push_soft_ask_dismissed'

function readInitialDismissed(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DISMISS_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Tarjeta Contextual Soft-Ask:
 * - Aparece en el momento de mayor intención emocional (tras enviar la respuesta del día mientras
 *   esperas a tu pareja, o como invitación suave descartable).
 * - Si detecta iOS Safari fuera de modo standalone, despliega automáticamente la guía de 2 pasos
 *   en lugar de pedir permisos nativos.
 */
export function ContextualPushPrompt({
  partnerName,
  variant = 'post_submission',
}: ContextualPushPromptProps) {
  const {
    uiState,
    subscribe,
    isSubscribing,
    subscribeError,
  } = usePushNotifications()

  const [isDismissed, setIsDismissed] = useState<boolean>(readInitialDismissed)
  const [justActivated, setJustActivated] = useState(false)

  const handleDismiss = () => {
    setIsDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_SESSION_KEY, '1')
    } catch {
      // Ignorar si sessionStorage está restringido
    }
  }

  if (justActivated) {
    return (
      <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3 flex items-center gap-2.5 text-xs text-emerald-800">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>¡Listo! Te avisaremos en cuanto haya novedades en su espacio.</span>
      </div>
    )
  }

  if (
    isDismissed ||
    uiState === 'loading' ||
    uiState === 'subscribed' ||
    uiState === 'unsupported' ||
    uiState === 'server_disabled' ||
    uiState === 'denied'
  ) {
    return null
  }

  const displayPartner = partnerName || 'tu pareja'

  if (uiState === 'ios_needs_install') {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Cerrar sugerencia de instalación"
          className="absolute top-2.5 right-2.5 p-1 rounded-full text-zinc-400 hover:text-[#18181B] hover:bg-white/80 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <IosStandaloneInstallGuide compact />
      </div>
    )
  }

  const headline =
    variant === 'post_submission'
      ? `¿Te avisamos cuando ${displayPartner} responda?`
      : `Recibe los toques y respuestas de ${displayPartner} al instante`

  const subtitle =
    variant === 'post_submission'
      ? 'Activa los avisos privados para descubrir sus respuestas juntos sin tener que revisar la app.'
      : 'Avisos 100% privados (nunca mostramos el contenido en la pantalla de bloqueo).'

  return (
    <div className="w-full rounded-xl border border-[#EAEAEA] bg-zinc-50/80 p-3.5 space-y-3 text-left relative">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Ahora no"
        className="absolute top-2.5 right-2.5 p-1 rounded-full text-zinc-400 hover:text-[#18181B] hover:bg-white transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-2.5 pr-5">
        <div className="w-7 h-7 rounded-lg bg-white border border-[#EAEAEA] flex items-center justify-center shrink-0 text-[#FF5C7A]">
          <Bell className="w-3.5 h-3.5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-[#18181B]">{headline}</p>
          <p className="text-[11.5px] text-zinc-500 leading-relaxed">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await subscribe()
              setJustActivated(true)
            } catch {
              // Error gestionado por subscribeError
            }
          }}
          disabled={isSubscribing}
          className="flex-1 py-2 px-3 rounded-lg bg-[#18181B] text-white text-xs font-medium hover:bg-zinc-800 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
        >
          {isSubscribing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Activando...</span>
            </>
          ) : (
            <>
              <Bell className="w-3.5 h-3.5" />
              <span>Activar avisos</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="py-2 px-3 rounded-lg bg-white border border-[#EAEAEA] text-zinc-600 text-xs font-medium hover:text-[#18181B] transition-colors cursor-pointer"
        >
          Ahora no
        </button>
      </div>

      {subscribeError && (
        <p className="text-[11px] text-rose-600">
          {subscribeError instanceof Error
            ? subscribeError.message
            : 'No se pudieron activar los avisos'}
        </p>
      )}
    </div>
  )
}
