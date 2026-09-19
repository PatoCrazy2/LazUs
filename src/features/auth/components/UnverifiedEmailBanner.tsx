import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react'
import { memo, useState } from 'react'
import { AuthApiError, authApi } from '../api/auth.api'
import { useAuth } from '../hooks/useAuth'

export const UnverifiedEmailBanner = memo(function UnverifiedEmailBanner() {
  const { user } = useAuth()
  const [isSending, setIsSending] = useState(false)
  const [hasSent, setHasSent] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // If email is verified or no user profile is loaded, omit banner
  if (!user || user.emailVerified) {
    return null
  }

  const handleResend = async () => {
    if (isSending || hasSent) return
    setIsSending(true)
    setSendError(null)

    try {
      await authApi.resendVerification({ email: user.email })
      setHasSent(true)
    } catch (err: unknown) {
      if (err instanceof AuthApiError) {
        setSendError(err.message)
      } else {
        setSendError('Error al reenviar. Inténtalo más tarde.')
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <aside
      role="status"
      aria-label="Aviso de verificación de correo"
      className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 backdrop-blur-md relative z-20"
    >
      <div className="max-w-md mx-auto flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-amber-300 min-w-0">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span className="truncate">
            Verifica tu correo (<span className="font-medium text-white">{user.email}</span>) para proteger tu cuenta.
          </span>
        </div>

        <div className="shrink-0 flex items-center">
          {hasSent ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              ¡Enviado!
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={isSending}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 hover:text-white border border-amber-500/30 text-[11px] font-medium transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-3 h-3" />
                  <span>Reenviar</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {sendError && (
        <div className="max-w-md mx-auto mt-1 text-[10px] text-rose-400 text-center">
          {sendError}
        </div>
      )}
    </aside>
  )
})