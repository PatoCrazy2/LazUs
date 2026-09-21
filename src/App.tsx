import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Heart, KeyRound, LogOut, Sparkles, User, Users, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AmbientRibbons, UnverifiedEmailBanner } from './features/auth/components'
import { useAuth } from './features/auth/hooks/useAuth'
import { PairingSettingsModal } from './features/couple/components'
import { useCouple } from './features/couple/hooks/useCouple'
import { authenticatedRoute, router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Guarded Dashboard Page for authenticated couple users.
 * Features the UnverifiedEmailBanner, couple profile info, affection taps, and secure logout.
 */
export function DashboardPage() {
  const { user, logout, isLoggingOut } = useAuth()
  const { partner } = useCouple()
  const [hearts, setHearts] = useState(0)
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false)

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between overflow-x-hidden bg-[#080c14] text-white pt-safe pb-safe">
      <AmbientRibbons />

      {/* Top Banner if email is not yet verified */}
      <UnverifiedEmailBanner />

      <header className="w-full max-w-md mx-auto flex justify-between items-center px-6 py-4 border-b border-white/5 text-xs text-slate-400 relative z-10">
        <span className="font-semibold tracking-wider text-rose-400 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" /> LazUs
        </span>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 bg-slate-800/80 px-2.5 py-1 rounded-full text-emerald-400 border border-emerald-500/20">
            <Wifi className="w-3.5 h-3.5" /> PWA Ready
          </span>

          <button
            type="button"
            onClick={() => setIsPairingModalOpen(true)}
            aria-label="Vincular pareja o ver código"
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-pink-400 transition-colors cursor-pointer border border-white/5 flex items-center gap-1 text-xs"
            title="Vincular Pareja"
          >
            <KeyRound className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            disabled={isLoggingOut}
            aria-label="Cerrar sesión"
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer border border-white/5"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center gap-6 my-auto px-6 py-8 text-center max-w-md mx-auto w-full">
        {/* User Greeting & Couple Status */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
            <User className="w-3.5 h-3.5 text-rose-400" />
            <span>
              Hola, <strong className="text-white font-medium">{user?.displayName || 'Amor'}</strong>
            </span>
          </div>

          {partner ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-500/10 border border-pink-500/20 text-xs text-pink-300">
              <Users className="w-3.5 h-3.5 text-pink-400" />
              <span>Unido con <strong className="text-white">{partner.display_name}</strong></span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsPairingModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Sin vincular • Toca aquí</span>
            </button>
          )}
        </div>

        {/* Center Pulsing Heart */}
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="relative"
        >
          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-rose-500/30 to-purple-500/30 flex items-center justify-center border border-rose-500/30 shadow-lg shadow-rose-500/10 backdrop-blur-md">
            <Heart className="w-14 h-14 text-rose-500 fill-rose-500/80" />
          </div>
        </motion.div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {partner ? `Espacio de ${user?.displayName || 'Tú'} & ${partner.display_name}` : 'Espacio Íntimo para Parejas'}
          </h1>
          <p className="text-sm text-slate-400 max-w-xs">
            {partner
              ? 'Su espacio compartido está activo. Toquen sus pulseras o completen la actividad diaria juntos.'
              : 'Acerca tu móvil a la pulsera de tu pareja o genera un código para comenzar el ritual.'}
          </p>
        </div>

        {/* Interaction Button */}
        <button
          type="button"
          onClick={() => setHearts((h) => h + 1)}
          className="specular-button px-6 py-3.5 rounded-full text-white font-medium text-sm flex items-center gap-2 cursor-pointer active:scale-95"
        >
          <Heart className="w-4 h-4 fill-white" />
          Toques de afecto: <span className="font-bold">{hearts}</span>
        </button>
      </main>

      {/* Pairing Settings Modal (Generar / Canjear Código LZ-XXXX) */}
      <PairingSettingsModal
        isOpen={isPairingModalOpen}
        onClose={() => setIsPairingModalOpen(false)}
      />

      <footer className="w-full text-xs text-slate-500 py-3 border-t border-white/5 text-center relative z-10">
        React 19 • TanStack Router • Dexie • Cloudflare
      </footer>
    </div>
  )
}

// Assign DashboardPage component to authenticatedRoute
authenticatedRoute.update({
  component: DashboardPage,
})

/**
 * AppRouter orchestrates router context injection and listens reactively to auth state.
 * Dispatches router.invalidate() whenever auth.isAuthenticated or auth.isLoading changes,
 * guaranteeing zero false redirects or bounces.
 */
export function AppRouter() {
  const auth = useAuth()

  // Invariant 1.1: Reactively re-evaluate route guards when auth resolves or flips
  useEffect(() => {
    void router.invalidate()
  }, [auth.isAuthenticated, auth.hasResolvedInitialAuth])

  return <RouterProvider router={router} context={{ auth }} />
}

export default function App() {
  // Mobile resilience: request persistent storage for offline database integrity
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage.persist) {
      void navigator.storage.persist()
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  )
}

