import { useNavigate, useParams } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useAuth } from '../../auth/hooks/useAuth'
import { resolveTapAction } from '../services/tapResolver'

/**
 * TapResolverPage: Punto de entrada para deep links HTTPS /tap/:tagId de pulseras NFC.
 * Resuelve en <50 ms desde Dexie sin parpadeos y redirige reemplazando la entrada del historial.
 */
export function TapResolverPage() {
  const { tagId } = useParams({ from: '/tap/$tagId' })
  const navigate = useNavigate()
  const { isAuthenticated, hasResolvedInitialAuth } = useAuth()
  const resolvedTagRef = useRef<string | null>(null)

  useEffect(() => {
    if (!hasResolvedInitialAuth) return

    if (!isAuthenticated) {
      void navigate({
        to: '/login',
        search: { redirect: `/tap/${tagId}` },
        replace: true,
      })
      return
    }

    if (resolvedTagRef.current === tagId) return
    resolvedTagRef.current = tagId

    void resolveTapAction(tagId)
      .then((decision) => {
        if (decision.type === 'redirect_link') {
          void navigate({
            to: '/link/$identifier',
            params: { identifier: decision.identifier },
            replace: true,
          })
          return
        }

        void navigate({
          to: '/',
          search: { tapIntent: decision.tapIntent },
          replace: true,
        })
      })
      .catch(() => {
        void navigate({
          to: '/',
          search: {},
          replace: true,
        })
      })
  }, [hasResolvedInitialAuth, isAuthenticated, tagId, navigate])

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-[#FFFFFF] text-[#18181B] p-6 select-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[#FF5C7A] animate-pulse" />
        </div>
        <p className="text-xs font-medium text-zinc-500">Conectando con tu espacio...</p>
      </div>
    </div>
  )
}
