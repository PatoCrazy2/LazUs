import React from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../../auth/hooks/useAuth'

/**
 * Placeholder provisional para LinkResolverPage en el Bloque 2
 * Se completará exhaustivamente con los 5 estados en el Bloque 3
 */
export function LinkResolverPage() {
  const { identifier } = useParams({ from: '/link/$identifier' })
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  React.useEffect(() => {
    if (!isAuthenticated) {
      void navigate({
        to: '/register',
        search: { redirect: `/link/${identifier}` },
      })
    }
  }, [isAuthenticated, identifier, navigate])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-3">
      <div className="w-8 h-8 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" />
      <p className="text-[#71717A] text-sm">Identificando pulsera o invitación...</p>
    </div>
  )
}
