import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { useEffect, useState } from 'react'

export interface FloatingHeartBurstProps {
  burstId: number | null
  partnerName?: string
}

const SATELLITE_OFFSETS = [
  { x: -34, y: -54, scale: 0.55, delay: 0.04 },
  { x: 36, y: -48, scale: 0.65, delay: 0.09 },
  { x: -6, y: -72, scale: 0.5, delay: 0.14 },
] as const

export function FloatingHeartBurst({ burstId, partnerName }: FloatingHeartBurstProps) {
  const [dismissedId, setDismissedId] = useState<number | null>(null)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (burstId === null) return
    const timer = setTimeout(() => {
      setDismissedId(burstId)
    }, 1900)
    return () => clearTimeout(timer)
  }, [burstId])

  const isVisible = burstId !== null && burstId !== dismissedId

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden"
      aria-live="polite"
    >
      <AnimatePresence>
        {isVisible && burstId !== null ? (
          <motion.div
            key={burstId}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 24 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: -16 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.12, y: -56 }}
            transition={{ duration: 0.42, ease: 'easeOut' }}
            className="relative flex flex-col items-center gap-2.5"
          >
            {!shouldReduceMotion &&
              SATELLITE_OFFSETS.map((item, idx) => (
                <motion.span
                  key={idx}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 0.9, 0], x: item.x, y: item.y, scale: item.scale }}
                  transition={{ duration: 0.85, delay: item.delay, ease: 'easeOut' }}
                  className="absolute top-2"
                  aria-hidden="true"
                >
                  <Heart className="w-5 h-5 text-[#FF5C7A] fill-[#FF5C7A]" />
                </motion.span>
              ))}

            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-rose-50/95 border border-rose-200/80 shadow-lg shadow-rose-500/15 backdrop-blur-md">
              <Heart className="w-10 h-10 text-[#FF5C7A] fill-[#FF5C7A]" />
            </div>

            <div className="px-3.5 py-1.5 rounded-full bg-white/95 border border-[#EAEAEA] shadow-sm text-xs font-medium text-[#18181B]">
              {partnerName
                ? `Toque enviado a ${partnerName} ❤️`
                : 'Toque de afecto enviado ❤️'}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
