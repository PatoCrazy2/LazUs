import { memo } from 'react'
import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { AmbientRibbons } from './AmbientRibbons'
import { IosChrome } from './IosChrome'

/**
 * High-performance anti-flicker splash screen rendered during initial authentication
 * resolution (checking Dexie local profile & background session sync).
 */
export const AuthSplash = memo(function AuthSplash() {
  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col items-center justify-between overflow-hidden bg-[#080c14] text-white">
      <AmbientRibbons pulseActive={true} />
      <IosChrome.StatusBar />

      <main className="relative z-10 my-auto flex flex-col items-center gap-6 px-6 text-center">
        {/* Soft pulsing emblem */}
        <motion.div
          animate={{ scale: [1, 1.05, 1], opacity: [0.9, 1, 0.9] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          className="relative"
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-rose-500/20 via-rose-600/30 to-purple-600/30 flex items-center justify-center border border-rose-500/30 shadow-2xl shadow-rose-500/20 backdrop-blur-md">
            <Heart className="w-11 h-11 text-rose-500 fill-rose-500/70" />
          </div>
        </motion.div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-rose-100 to-slate-200 bg-clip-text text-transparent">
            LazUs
          </h1>
          <p className="text-xs font-medium text-rose-300/80 tracking-widest uppercase">
            Nuestro espacio íntimo
          </p>
        </div>

        {/* Subtle loader bar */}
        <div className="w-36 h-1 bg-slate-800/80 rounded-full overflow-hidden mt-4 border border-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-rose-500 to-purple-500 rounded-full"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
          />
        </div>
      </main>

      <IosChrome.HomeIndicator />
    </div>
  )
})
