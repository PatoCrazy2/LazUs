import { Outlet } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { memo } from 'react'
import { AmbientRibbons } from './AmbientRibbons'
import { IosChrome } from './IosChrome'

interface AuthLayoutProps {
  children?: React.ReactNode
}

/**
 * Visual shell for all authentication surfaces (Login, Register, Forgot Password, Reset Password, Verify Email).
 * Bundles ambient glowing ribbons, simulated iOS chrome, fluid AnimatePresence transitions,
 * and an A11y polite announcer region.
 */
export const AuthLayout = memo(function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between overflow-x-hidden bg-[#080c14] text-white">
      {/* Generative ambient ribbons background */}
      <AmbientRibbons />

      {/* iOS Chrome Header (Status Bar spacer/simulator) */}
      <IosChrome.StatusBar />

      {/* Accessibility live region for screen readers announcing view updates */}
      <div aria-live="polite" className="sr-only" role="status" />

      {/* Main interactive area with responsive container */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={typeof window !== 'undefined' ? window.location.pathname : 'auth-page'}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="w-full flex justify-center"
          >
            {children ? children : <Outlet />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* iOS Chrome Bottom (Home indicator spacer) */}
      <IosChrome.HomeIndicator />
    </div>
  )
})