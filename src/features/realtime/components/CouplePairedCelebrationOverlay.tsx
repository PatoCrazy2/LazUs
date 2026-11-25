import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PairingCelebration } from '../realtime.context'

interface CouplePairedCelebrationOverlayProps {
  celebration: PairingCelebration | null
}

export function CouplePairedCelebrationOverlay({
  celebration,
}: CouplePairedCelebrationOverlayProps) {
  const [dismissedId, setDismissedId] = useState<number | null>(null)

  useEffect(() => {
    if (!celebration) return
    const timer = setTimeout(() => {
      setDismissedId(celebration.id)
    }, 2800)
    return () => clearTimeout(timer)
  }, [celebration])

  const isVisible = celebration !== null && celebration.id !== dismissedId

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center px-6 overflow-hidden"
      aria-live="assertive"
    >
      <AnimatePresence>
        {isVisible && celebration ? (
          <motion.div
            key={celebration.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 flex items-center justify-center bg-white/65 backdrop-blur-sm px-6"
          >
            {/* Ondas expansivas suaves */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0.65 }}
              animate={{ scale: 2.3, opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
              className="absolute w-44 h-44 rounded-full border-2 border-[#FF5C7A]/50"
            />
            <motion.div
              initial={{ scale: 0.5, opacity: 0.5 }}
              animate={{ scale: 2.7, opacity: 0 }}
              transition={{ duration: 1.7, delay: 0.18, ease: 'easeOut' }}
              className="absolute w-44 h-44 rounded-full border border-[#8B5CF6]/40"
            />

            {/* Tarjeta central de unión */}
            <motion.div
              initial={{ opacity: 0, scale: 0.82, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -12 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="relative w-full max-w-xs rounded-[28px] bg-white/95 border border-[#EAEAEA] shadow-2xl shadow-rose-500/15 px-7 py-6 text-center space-y-3"
            >
              <div className="mx-auto relative flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 border border-rose-200/80">
                <Heart className="w-8 h-8 text-[#FF5C7A] fill-[#FF5C7A]" />
                <Sparkles className="w-4 h-4 text-[#8B5CF6] absolute -top-1 -right-1" />
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#FF5C7A]">
                  Vínculo confirmado
                </p>
                <h2 className="text-lg font-bold tracking-tight text-[#18181B]">
                  ¡Ya estás con {celebration.partnerDisplayName}!
                </h2>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Su espacio privado se activó al instante. El reto de hoy ya está listo.
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
