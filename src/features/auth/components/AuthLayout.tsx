import { Outlet } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import React, { memo } from 'react'
import { AmbientRibbons } from './AmbientRibbons'

interface AuthLayoutProps {
  children?: React.ReactNode
}

/**
 * Visual shell for all authentication surfaces (Login, Register, Forgot Password, Reset Password, Verify Email).
 * Bundles ambient glowing ribbons, fluid AnimatePresence transitions,
 * native safe-area insets (pt-safe, pb-safe), and an A11y polite announcer region on a pure white Stitch canvas.
 */
export const AuthLayout = memo(function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between overflow-x-hidden bg-white text-[#18181B] select-none pt-safe pb-safe">
      {/* Generative ambient ribbons background */}
      <AmbientRibbons />

      {/* Accessibility live region for screen readers announcing view updates */}
      <div aria-live="polite" className="sr-only" role="status" />

      {/* Main interactive area with responsive mobile container */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center px-4 py-4 max-w-[390px] mx-auto">
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
    </div>
  )
})