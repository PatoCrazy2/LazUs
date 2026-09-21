import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { memo } from 'react'

interface AutoClaimSuccessProps {
  userName?: string
  onContinue: () => void
}

/**
 * Pantalla efímera de celebración del Auto-claim.
 * Comunica que la pulsera virgen ha sido vinculada mágicamente al usuario.
 */
export const AutoClaimSuccess = memo(function AutoClaimSuccess({
  userName = 'ti',
  onContinue,
}: AutoClaimSuccessProps) {
  return (
    <div className="w-full max-w-[390px] mx-auto flex-1 flex flex-col items-center justify-between py-6 text-center select-none">
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        {/* Glow & Animated Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="relative flex items-center justify-center"
        >
          {/* Ambient Glow */}
          <div className="absolute w-28 h-28 rounded-full bg-gradient-to-tr from-[#FF5C7A]/25 to-[#8B5CF6]/25 blur-xl -z-10 animate-pulse" />

          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#FF5C7A] to-[#8B5CF6] p-[2px] shadow-lg shadow-pink-500/10">
            <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 400, damping: 15 }}
              >
                <Check className="w-9 h-9 text-[#FF5C7A]" strokeWidth={2.5} />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Copy */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-2 px-4"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-50 text-[#FF5C7A] text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>PULSERA ACTIVADA</span>
          </div>
          <h2 className="text-[26px] font-bold tracking-tight text-[#18181B] leading-snug">
            ¡Pulsera enlazada para {userName}!
          </h2>
          <p className="text-[14px] text-[#71717A] max-w-[280px] mx-auto leading-relaxed">
            Tu pulsera física LazUs ha quedado registrada en tu cuenta. Ahora tu pareja puede escanearla para unirse a ti.
          </p>
        </motion.div>
      </div>

      {/* Action Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="w-full px-4 pt-4"
      >
        <button
          type="button"
          onClick={onContinue}
          className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer shadow-md shadow-black/5"
        >
          <span>Ir a mi espacio</span>
        </button>
      </motion.div>
    </div>
  )
})
