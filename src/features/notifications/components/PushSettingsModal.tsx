import {
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  Send,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { IosStandaloneInstallGuide } from './IosStandaloneInstallGuide'

export interface PushSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  partnerName?: string
}

/**
 * Modal de Ajustes de Notificaciones por Dispositivo:
 * - Muestra estado exacto del dispositivo actual (`subscribed`, `ios_needs_install`, `denied`, etc.).
 * - Permite activar/desactivar avisos en este dispositivo concreto.
 * - Incluye botón "Probar aviso en este dispositivo (3s)" para bloquear la pantalla y verificar APNs/FCM.
 */
export function PushSettingsModal({ isOpen, onClose, partnerName }: PushSettingsModalProps) {
  const {
    uiState,
    isSubscribedOnDevice,
    subscriptionsCount,
    subscribe,
    isSubscribing,
    subscribeError,
    unsubscribe,
    isUnsubscribing,
    sendTestNotification,
    isSendingTest,
    testCountdown,
    testDeliveredMessage,
    testError,
  } = usePushNotifications()

  if (!isOpen) return null

  const displayPartner = partnerName || 'tu pareja'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-[390px] bg-white rounded-[24px] border border-[#EAEAEA] p-6 shadow-2xl text-[#18181B] space-y-5 relative select-none">
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-[#EAEAEA]/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-pink-50 text-[#FF5C7A]">
              <Bell className="w-4 h-4" />
            </div>
            <h2 className="text-[17px] font-bold tracking-tight">Avisos Privados</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes de avisos"
            className="p-1.5 rounded-full hover:bg-zinc-100 text-[#71717A] hover:text-[#18181B] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Estado por escenario */}
        {uiState === 'ios_needs_install' && <IosStandaloneInstallGuide />}

        {uiState === 'unsupported' && (
          <div className="p-4 rounded-xl bg-zinc-50 border border-[#EAEAEA] text-xs text-zinc-600 space-y-1">
            <p className="font-semibold text-[#18181B]">Navegador sin soporte Web Push</p>
            <p>
              Abre LazUs en Safari (instalada en pantalla de inicio en iOS 16.4+) o Chrome/Edge
              para recibir notificaciones.
            </p>
          </div>
        )}

        {uiState === 'server_disabled' && (
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Servicio Push no configurado en este entorno</p>
            <p>
              Faltan las claves VAPID del servidor (`pnpm run vapid:generate`) para emitir avisos.
            </p>
          </div>
        )}

        {uiState === 'denied' && (
          <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 text-xs text-rose-800 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <TriangleAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Permiso bloqueado en este dispositivo</span>
            </div>
            <p className="leading-relaxed">
              Habilita las notificaciones para LazUs en los ajustes de tu navegador o sistema
              operativo y vuelve a intentarlo.
            </p>
          </div>
        )}

        {(uiState === 'prompt' || uiState === 'unsubscribed' || uiState === 'subscribed') && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl border border-[#EAEAEA] bg-zinc-50/60 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-[#18181B]">
                  {isSubscribedOnDevice ? 'Activos en este dispositivo' : 'Inactivos en este dispositivo'}
                </p>
                <p className="text-xs text-zinc-500">
                  {isSubscribedOnDevice
                    ? `Recibirás toques y retos de ${displayPartner}.`
                    : `Actívalos para enterarte cuando ${displayPartner} interactúe.`}
                </p>
              </div>

              {isSubscribedOnDevice ? (
                <button
                  type="button"
                  onClick={() => void unsubscribe()}
                  disabled={isUnsubscribing}
                  className="px-3.5 py-2 rounded-xl bg-white border border-[#EAEAEA] text-xs font-medium text-zinc-700 hover:text-rose-600 hover:border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isUnsubscribing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <BellOff className="w-3.5 h-3.5" />
                  )}
                  <span>Desactivar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void subscribe().catch(() => undefined)}
                  disabled={isSubscribing}
                  className="px-4 py-2 rounded-xl bg-[#18181B] text-white text-xs font-medium hover:bg-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isSubscribing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Bell className="w-3.5 h-3.5" />
                  )}
                  <span>Activar</span>
                </button>
              )}
            </div>

            {subscriptionsCount > 0 && (
              <p className="text-[11px] text-zinc-400 px-1">
                Tienes {subscriptionsCount}{' '}
                {subscriptionsCount === 1 ? 'dispositivo vinculado' : 'dispositivos vinculados'} a tu
                cuenta.
              </p>
            )}

            {/* Botón de prueba con retardo de 3s para bloquear pantalla */}
            {isSubscribedOnDevice && (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => void sendTestNotification().catch(() => undefined)}
                  disabled={isSendingTest}
                  className="w-full py-2.5 px-4 rounded-xl bg-pink-50/70 hover:bg-pink-100/70 border border-pink-200/80 text-xs font-medium text-[#18181B] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-70"
                >
                  {testCountdown !== null ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5C7A]" />
                      <span>Bloquea tu pantalla ahora ({testCountdown}s)...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 text-[#FF5C7A]" />
                      <span>Enviar aviso de prueba (en 3s)</span>
                    </>
                  )}
                </button>

                {testDeliveredMessage && (
                  <p className="text-[11.5px] text-emerald-700 flex items-center justify-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{testDeliveredMessage}</span>
                  </p>
                )}

                {testError && (
                  <p className="text-[11.5px] text-rose-600 text-center">
                    {testError instanceof Error ? testError.message : 'Error al enviar prueba'}
                  </p>
                )}
              </div>
            )}

            {subscribeError && (
              <p className="text-xs text-rose-600">
                {subscribeError instanceof Error
                  ? subscribeError.message
                  : 'No se pudieron activar los avisos'}
              </p>
            )}
          </div>
        )}

        {/* Nota de privacidad Zero-Leak */}
        <div className="pt-2 border-t border-[#EAEAEA]/80 flex items-start gap-2 text-[11px] text-zinc-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            Privacidad Zero-Leak: tus respuestas, fotos y notas de voz jamás viajan dentro de las
            notificaciones.
          </span>
        </div>
      </div>
    </div>
  )
}
