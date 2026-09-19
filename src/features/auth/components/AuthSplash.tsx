import { memo } from 'react'
import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { AmbientRibbons } from './AmbientRibbons'

/**
 * High-performance anti-flicker splash screen rendered during initial authentication
 * resolution (checking Dexie local profile & background session sync) on Stitch white canvas.
 */
export const AuthSplash = memo(function AuthSplash() {
  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col items-center justify-between overflow-hidden bg-white text-[#18181B] select-none pt-safe pb-safe">
      <AmbientRibbons pulseActive={true} />

      <main className="relative z-10 my-auto flex flex-col items-center gap-6 px-6 text-center">
        {/* Soft pulsing emblem */}
        <motion.div
          animate={{ scale: [1, 1.05, 1], opacity: [0.92, 1, 0.92] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          className="relative"
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#FF5C7A]/20 via-[#FF4D8D]/25 to-[#8B5CF6]/20 flex items-center justify-center border border-[#FF4D8D]/30 shadow-lg shadow-[#FF4D8D]/10 backdrop-blur-md">
            <Heart className="w-11 h-11 text-[#FF4D8D] fill-[#FF4D8D]/80" />
          </div>
        </motion.div>

        <div className="space-y-1.5">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight text-[#18181B]">
            LazUs
          </h1>
          <p className="text-[14px] font-normal text-[#71717A] tracking-normal">
            El espacio compartido para los dos.
          </p>
        </div>

        {/* Subtle loader bar */}
        <div className="w-36 h-1 bg-[#18181B]/10 rounded-full overflow-hidden mt-3 border border-[#EAEAEA]/80">
          <motion.div
            className="h-full bg-gradient-to-r from-[#FF5C7A] via-[#FF4D8D] to-[#8B5CF6] rounded-full"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
          />
        </div>
      </main>
    </div>
  )
})
