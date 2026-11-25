import { motion } from 'framer-motion'
import { Check, Heart, Loader2, Sparkles, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCouple } from '../hooks/useCouple'

interface PairingRitualScreenProps {
  identifier: string
  partnerName: string
  partnerAvatarUrl?: string | null
  onSuccess: () => void
  onCancel: () => void
}

/**
 * PairingRitualScreen: Pantalla a pantalla completa (Full-Screen) dedicada al "Ritual de Unión".
 * - Otorga el máximo peso emocional al momento de la vinculación de la pareja.
 * - Validación estricta online: deshabilita la acción si navigator.onLine === false.
 * - Invoca pair({ identifier, clientMutationId }) con UUIDv4 para garantizar idempotencia.
 * - Ejecuta una celebración animada con Framer Motion antes de redirigir al espacio compartido.
 */
export function PairingRitualScreen({
  identifier,
  partnerName,
  partnerAvatarUrl,
  onSuccess,
  onCancel,
}: PairingRitualScreenProps) {
  const { pair, isPairing, pairError } = useCouple()

  // Detección reactiva de estado de conexión
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [isCelebrated, setIsCelebrated] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleConfirmPair = async () => {
    if (!isOnline || isPairing || isCelebrated) return
    setErrorMessage(null)

    try {
      const clientMutationId = crypto.randomUUID()
      await pair({ identifier, clientMutationId })
      // Éxito: activar la animación de celebración antes de la transición
      setIsCelebrated(true)
      setTimeout(() => {
        onSuccess()
      }, 2200)
    } catch (err: any) {
      if (err.status === 409) {
        setErrorMessage(
          'No se pudo vincular: uno de los dos ya pertenece a una pareja activa en LazUs.'
        )
      } else {
        setErrorMessage(
          err.message || 'Ocurrió un error al procesar la unión. Inténtalo de nuevo.'
        )
      }
    }
  }

  // Vista de Celebración Post-Unión
  if (isCelebrated) {
    return (
      <div className="w-full max-w-[390px] mx-auto min-h-[80vh] flex flex-col items-center justify-center text-center p-6 space-y-6 select-none">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [1, 1.15, 1], opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="relative flex items-center justify-center"
        >
          {/* Ambient Glow Expansivo */}
          <div className="absolute w-36 h-36 rounded-full bg-gradient-to-tr from-[#FF5C7A]/40 to-[#8B5CF6]/40 blur-2xl animate-pulse" />

          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#FF5C7A] to-[#8B5CF6] p-[2px] shadow-2xl shadow-pink-500/20">
            <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 350, damping: 15 }}
              >
                <Heart className="w-12 h-12 text-[#FF5C7A] fill-[#FF5C7A]" />
              </motion.div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2.5 px-4"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-50 text-[#FF5C7A] text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>UNIÓN COMPLETADA</span>
          </div>
          <h2 className="text-[28px] font-bold tracking-tight text-[#18181B] leading-tight">
            ¡Ahora están unidos!
          </h2>
          <p className="text-[14.5px] text-[#71717A] max-w-[280px] mx-auto leading-relaxed">
            Tu espacio con <span className="font-semibold text-[#18181B]">{partnerName}</span> ha sido creado. Preparando su espacio compartido...
          </p>
        </motion.div>
      </div>
    )
  }

  // Vista Principal del Ritual de Unión
  return (
    <div className="w-full max-w-[390px] mx-auto min-h-[85vh] flex flex-col justify-between py-6 px-4 text-center select-none">
      {/* Header Emocional */}
      <section className="pt-6 space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-50/80 border border-pink-100 text-[#FF5C7A] text-[11.5px] font-semibold tracking-wider uppercase">
          <Heart className="w-3.5 h-3.5 fill-[#FF5C7A]" />
          <span>El Ritual de Unión</span>
        </div>
      </section>

      {/* Contenido Central: Avatar / Conexión */}
      <section className="my-auto py-6 flex flex-col items-center space-y-6">
        <div className="relative flex items-center justify-center">
          {/* Anillos concéntricos sutiles */}
          <div className="absolute w-32 h-32 rounded-full border border-pink-200/60 animate-ping opacity-25" />
          <div className="absolute w-28 h-28 rounded-full bg-gradient-to-tr from-[#FF5C7A]/15 to-[#8B5CF6]/15 blur-md" />

          {partnerAvatarUrl ? (
            <img
              src={partnerAvatarUrl}
              alt={partnerName}
              className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md relative z-10"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#FF5C7A] to-[#8B5CF6] p-[2px] shadow-md relative z-10">
              <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-[#18181B]">
                  {partnerName.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 px-2">
          <h1 className="text-[26px] font-bold tracking-tight text-[#18181B] leading-snug">
            ¿Deseas vincularte con {partnerName}?
          </h1>
          <p className="text-[14px] text-[#71717A] max-w-[300px] mx-auto leading-relaxed">
            Al unirse, compartirán un espacio privado exclusivo para ambos con dinámicas diarias, recuerdos y toques físicos.
          </p>
        </div>

        {/* Error Feedback */}
        {(errorMessage || pairError) && (
          <div
            role="alert"
            className="w-full p-3.5 rounded-[15px] bg-rose-50 border border-rose-200/70 text-rose-800 text-xs font-medium text-left space-y-1"
          >
            <p className="font-semibold text-rose-900">No se pudo completar el ritual</p>
            <p>{errorMessage || (pairError as any)?.message}</p>
          </div>
        )}

        {/* Offline Warning Banner */}
        {!isOnline && (
          <div
            role="alert"
            className="w-full p-3.5 rounded-[15px] bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5 text-left"
          >
            <WifiOff className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">Sin conexión a internet</p>
              <p className="text-amber-800/90 text-[11.5px]">
                Necesitas conexión a internet para este ritual tan importante.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Acciones */}
      <footer className="space-y-3 pt-2">
        <button
          type="button"
          onClick={handleConfirmPair}
          disabled={!isOnline || isPairing}
          className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer shadow-md shadow-black/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPairing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Realizando unión...</span>
            </>
          ) : (
            <>
              <span>Aceptar y vincularnos</span>
              <Check className="w-4 h-4 text-white/90" strokeWidth={2.5} />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={isPairing}
          className="w-full py-2.5 text-xs text-[#71717A] hover:text-[#18181B] transition-colors cursor-pointer"
        >
          Ahora no, volver a mi espacio
        </button>
      </footer>
    </div>
  )
}
