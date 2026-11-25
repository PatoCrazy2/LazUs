import { AnimatePresence, motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AffectionPulse } from '../realtime.context'

interface AffectionHeartOverlayProps {
  pulse: AffectionPulse | null
  partnerName?: string
}

export function AffectionHeartOverlay({ pulse, partnerName }: AffectionHeartOverlayProps) {
  const [dismissedId, setDismissedId] = useState<number | null>(null)

  useEffect(() => {
    if (!pulse) return
    const timer = setTimeout(() => {
      setDismissedId(pulse.id)
    }, 1900)
    return () => clearTimeout(timer)
  }, [pulse])

  const isVisible = pulse !== null && pulse.id !== dismissedId

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden"
      aria-live="polite"
    >
      <AnimatePresence>
        {isVisible && pulse ? (
          <motion.div
            key={pulse.id}
            initial={{ opacity: 0, scale: 0.65, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: -18 }}
            exit={{ opacity: 0, scale: 1.15, y: -64 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="flex flex-col items-center gap-2.5"
          >
            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-rose-50/90 border border-rose-200/80 shadow-lg shadow-rose-500/15 backdrop-blur-md">
              <Heart className="w-10 h-10 text-[#FF5C7A] fill-[#FF5C7A]" />
            </div>

            <div className="px-3.5 py-1.5 rounded-full bg-white/95 border border-[#EAEAEA] shadow-sm text-xs font-medium text-[#18181B]">
              {partnerName ? `${partnerName} te envió un toque` : 'Tu pareja te envió un toque'}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
