import { useNavigate, useParams } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, HeartHandshake, Radio } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/hooks/useAuth'
import { useCouple, useResolveIdentifier } from '../hooks/useCouple'
import { AutoClaimSuccess } from './AutoClaimSuccess'

/**
 * LinkResolverPage: Maneja de forma inteligente y reactiva los 5 estados de resolución:
 * 1. 'unclaimed': Pulsera virgen detectada -> auto-reclama silenciosamente -> pantalla de éxito.
 * 2. 'ready_to_pair': Pulsera o invitación válida de la pareja -> despacha el Ritual de Unión.
 * 3. 'owned_by_me': Pulsera propia del usuario autenticado -> mensaje informativo y regreso.
 * 4. 'already_paired': El tag ya pertenece a una pareja activa -> mensaje inline claro y controlado.
 * 5. 'invalid': Código inexistente o caducado -> mensaje de error amigable.
 */
export function LinkResolverPage() {
  const { identifier } = useParams({ from: '/link/$identifier' })
  const navigate = useNavigate()
  const { user, isAuthenticated, hasResolvedInitialAuth } = useAuth()
  const { claimTag } = useCouple()

  const [hasAutoClaimed, setHasAutoClaimed] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  // Consulta de resolución (/api/couple/resolve/:identifier)
  const { data: tagData, isLoading, error } = useResolveIdentifier(identifier, {
    enabled: Boolean(identifier) && hasResolvedInitialAuth,
  })

  // 1. Redirección si no está autenticado (con search.redirect)
  useEffect(() => {
    if (hasResolvedInitialAuth && !isAuthenticated) {
      void navigate({
        to: '/register',
        search: { redirect: `/link/${identifier}` },
      })
    }
  }, [hasResolvedInitialAuth, isAuthenticated, identifier, navigate])

  // 2. Manejo automático de 'unclaimed': Auto-claim silencioso JIT
  useEffect(() => {
    if (
      isAuthenticated &&
      tagData &&
      tagData.state === 'unclaimed' &&
      !hasAutoClaimed &&
      !claimError
    ) {
      void claimTag(tagData.identifier)
        .then(() => {
          setHasAutoClaimed(true)
        })
        .catch((err: any) => {
          setClaimError(err.message || 'No se pudo reclamar la pulsera')
        })
    }
  }, [isAuthenticated, tagData, hasAutoClaimed, claimError, claimTag])

  // Estado de carga inicial
  if (!hasResolvedInitialAuth || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4 select-none">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-[#18181B]/15 border-t-[#18181B] animate-spin" />
          <Radio className="w-5 h-5 text-[#18181B] absolute" />
        </div>
        <div className="space-y-1">
          <p className="text-[#18181B] text-[15px] font-medium tracking-tight">
            Identificando pulsera...
          </p>
          <p className="text-[#A1A1AA] text-xs">
            Comprobando código y autenticidad del enlace
          </p>
        </div>
      </div>
    )
  }

  // Estado de error de red o backend
  if (error || claimError) {
    return (
      <div className="w-full max-w-[390px] mx-auto min-h-[50vh] flex flex-col items-center justify-center text-center p-6 space-y-5">
        <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-sm">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-[#18181B]">No se pudo vincular</h2>
          <p className="text-xs text-[#71717A] max-w-[280px]">
            {claimError || (error as any)?.message || 'Ocurrió un error al verificar la pulsera.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: '/' })}
          className="px-5 py-2.5 rounded-[15px] bg-[#18181B] text-white text-xs font-medium active:scale-95 transition-all"
        >
          Volver al inicio
        </button>
      </div>
    )
  }

  // CASO 1: 'unclaimed' con auto-claim completado exitosamente
  if (tagData?.state === 'unclaimed' && hasAutoClaimed) {
    return (
      <AutoClaimSuccess
        userName={user?.displayName}
        onContinue={() => void navigate({ to: '/' })}
      />
    )
  }

  // CASO 2: 'ready_to_pair' -> Redirigir o mostrar pantalla del Ritual de Unión
  if (tagData?.state === 'ready_to_pair') {
    // Al detectarlo listo para vincular, navegamos a la pantalla del ritual
    // (o renderizamos el ritual directamente pasándole el partner y el identifier)
    return (
      <div className="w-full max-w-[390px] mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-6">
        <div className="w-16 h-16 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center text-[#FF5C7A] shadow-sm">
          <HeartHandshake className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#FF5C7A] uppercase bg-pink-50/80 px-2.5 py-1 rounded-full">
            Invitación detectada
          </span>
          <h2 className="text-2xl font-bold text-[#18181B] tracking-tight">
            ¿Vincularte con {tagData.owner?.display_name || 'tu pareja'}?
          </h2>
          <p className="text-sm text-[#71717A] max-w-[290px] mx-auto leading-relaxed">
            Has escaneado la pulsera de tu pareja. Toca el botón para completar el ritual de unión.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            // Navegar al Ritual de Unión (Bloque 4) pasando el identificador
            void navigate({
              to: '/', // Provisional hasta montar el ritual o ejecutar directamente
            })
          }}
          className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer"
        >
          <span>Continuar al Ritual de Unión</span>
        </button>
      </div>
    )
  }

  // CASO 3: 'owned_by_me' -> La pulsera ya pertenece a este usuario
  if (tagData?.state === 'owned_by_me') {
    return (
      <div className="w-full max-w-[390px] mx-auto min-h-[50vh] flex flex-col items-center justify-center text-center p-6 space-y-5">
        <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
          <Radio className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-[#18181B]">Esta es tu pulsera</h2>
          <p className="text-xs text-[#71717A] max-w-[280px]">
            Ya está asociada a tu perfil. Tu pareja debe ser quien la escanee para unirse a ti.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: '/' })}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[15px] bg-[#18181B] text-white text-xs font-medium active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a mi espacio</span>
        </button>
      </div>
    )
  }

  // CASO 4: 'already_paired' -> El tag ya pertenece a una pareja activa
  if (tagData?.state === 'already_paired') {
    return (
      <div className="w-full max-w-[390px] mx-auto min-h-[50vh] flex flex-col items-center justify-center text-center p-6 space-y-5">
        <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-[#18181B]">Pulsera ya vinculada</h2>
          <p className="text-xs text-[#71717A] max-w-[280px]">
            Esta pulsera ya pertenece a una pareja activa en LazUs y no puede ser reclamada nuevamente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: '/' })}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[15px] bg-[#18181B] text-white text-xs font-medium active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver al inicio</span>
        </button>
      </div>
    )
  }

  // CASO 5: 'invalid' o cualquier otro estado no contemplado
  return (
    <div className="w-full max-w-[390px] mx-auto min-h-[50vh] flex flex-col items-center justify-center text-center p-6 space-y-5">
      <div className="w-14 h-14 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 shadow-sm">
        <AlertCircle className="w-7 h-7" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-[#18181B]">Enlace no válido</h2>
        <p className="text-xs text-[#71717A] max-w-[280px]">
          El código o identificador no existe o ha caducado. Verifica con tu pareja e intenta de nuevo.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void navigate({ to: '/' })}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[15px] bg-[#18181B] text-white text-xs font-medium active:scale-95 transition-all cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Ir a mi espacio</span>
      </button>
    </div>
  )
}
