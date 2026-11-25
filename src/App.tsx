import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { KeyRound, LogOut, Sparkles, User, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ActivityHistoryList, TodayActivityCard } from './features/activities/components'
import { AmbientRibbons, UnverifiedEmailBanner } from './features/auth/components'
import { useAuth } from './features/auth/hooks/useAuth'
import { PairingSettingsModal } from './features/couple/components'
import { useCouple } from './features/couple/hooks/useCouple'
import { AffectionHeartOverlay } from './features/realtime/components/AffectionHeartOverlay'
import { PartnerPresenceBadge } from './features/realtime/components/PartnerPresenceBadge'
import { useCoupleRealtime } from './features/realtime/hooks/useCoupleRealtime'
import { RealtimeProvider } from './features/realtime/RealtimeProvider'
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
 * Protagonist: Today's Blind Reveal Activity + Revealed History below.
 */
export function DashboardPage() {
  const { user, logout, isLoggingOut } = useAuth()
  const { partner } = useCouple()
  const { isPartnerOnline, affectionPulse } = useCoupleRealtime()
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false)

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between overflow-x-hidden bg-[#FFFFFF] text-[#18181B] pt-safe pb-safe">
      <AmbientRibbons />
      <AffectionHeartOverlay pulse={affectionPulse} partnerName={partner?.display_name} />

      {/* Top Banner if email is not yet verified */}
      <UnverifiedEmailBanner />

      <header className="w-full max-w-md mx-auto flex justify-between items-center px-5 py-4 border-b border-[#EAEAEA] text-xs text-zinc-500 relative z-10 bg-white/80 backdrop-blur-md">
        <span className="font-semibold tracking-wider text-[#18181B] flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#FF5C7A]" /> LazUs
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPairingModalOpen(true)}
            aria-label="Vincular pareja o ver código"
            className="p-2 rounded-lg bg-white hover:bg-zinc-50 text-zinc-600 hover:text-[#18181B] transition-colors cursor-pointer border border-[#EAEAEA]"
            title="Vincular Pareja"
          >
            <KeyRound className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            disabled={isLoggingOut}
            aria-label="Cerrar sesión"
            className="p-2 rounded-lg bg-white hover:bg-zinc-50 text-zinc-600 hover:text-rose-600 transition-colors cursor-pointer border border-[#EAEAEA]"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center gap-6 px-5 py-6 max-w-md mx-auto w-full flex-1">
        {/* Saludo y estado de pareja */}
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#EAEAEA] text-xs text-zinc-600">
            <User className="w-3.5 h-3.5 text-[#FF5C7A]" />
            <span>
              Hola, <strong className="text-[#18181B] font-medium">{user?.displayName || 'Amor'}</strong>
            </span>
          </div>

          {partner ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#EAEAEA] text-xs text-zinc-600">
              <Users className="w-3.5 h-3.5 text-[#FF5C7A]" />
              <span>
                Con <strong className="text-[#18181B] font-medium">{partner.display_name}</strong>
              </span>
              <PartnerPresenceBadge isOnline={isPartnerOnline} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsPairingModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-xs text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sin vincular • Toca aquí</span>
            </button>
          )}
        </div>

        {/* Protagonista: Reto de Hoy + Historial debajo */}
        {partner ? (
          <div className="w-full space-y-6">
            <TodayActivityCard />
            <ActivityHistoryList />
          </div>
        ) : (
          <div className="w-full rounded-2xl border border-[#EAEAEA] bg-white p-6 text-center space-y-4 my-auto">
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold tracking-tight text-[#18181B]">
                Vincula tu espacio compartido
              </h1>
              <p className="text-sm text-zinc-500">
                Acerca tu móvil a la pulsera NFC de tu pareja o genera un código digital para
                desbloquear las actividades diarias.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsPairingModalOpen(true)}
              className="w-full py-3 rounded-xl bg-[#18181B] text-white text-sm font-medium hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Vincular pareja ahora
            </button>
          </div>
        )}
      </main>

      {/* Pairing Settings Modal (Generar / Canjear Código LZ-XXXX) */}
      <PairingSettingsModal
        isOpen={isPairingModalOpen}
        onClose={() => setIsPairingModalOpen(false)}
      />
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
      <RealtimeProvider>
        <AppRouter />
      </RealtimeProvider>
    </QueryClientProvider>
  )
}

