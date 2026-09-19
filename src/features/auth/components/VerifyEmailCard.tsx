import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AlertCircle, CheckCircle2, Loader2, Mail, Send, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { VerifyEmailInputSchema } from '../../../../shared'
import { AuthApiError, authApi } from '../api/auth.api'
import { useAuth } from '../hooks/useAuth'
import { authStore } from '../store/auth.store'

export function VerifyEmailCard() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const search = useSearch({ strict: false }) as { token?: string }
  const token = search.token || ''

  const [isVerifying, setIsVerifying] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  // Resend state for expired or invalid token
  const [resendEmail, setResendEmail] = useState(user?.email || '')
  const [isResending, setIsResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)

  // Invariant 2.2: Ensure referrer policy is set to prevent email scanner token leakage
  useEffect(() => {
    let meta = document.querySelector('meta[name="referrer"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'referrer')
      meta.setAttribute('content', 'no-referrer')
      document.head.appendChild(meta)
    }
  }, [])

  const handleVerify = async () => {
    if (!token || isVerifying) return

    setVerifyError(null)
    const validation = VerifyEmailInputSchema.safeParse({ token })
    if (!validation.success) {
      setVerifyError('El enlace de verificación no contiene un formato de token válido.')
      return
    }

    setIsVerifying(true)
    try {
      await authApi.verifyEmail(validation.data)
      setIsVerified(true)

      // Update local Dexie store if currently logged in
      if (isAuthenticated && user) {
        await authStore.saveProfile({
          ...user,
          emailVerified: true,
        })
      }
    } catch (err: unknown) {
      if (err instanceof AuthApiError) {
        setVerifyError(err.message)
      } else {
        setVerifyError('No pudimos verificar tu correo. El enlace puede haber expirado.')
      }
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetEmail = isAuthenticated && user ? user.email : resendEmail
    if (!targetEmail || isResending) return

    setIsResending(true)
    setResendError(null)

    try {
      await authApi.resendVerification({ email: targetEmail })
      setResendSuccess(true)
    } catch (err: unknown) {
      if (err instanceof AuthApiError) {
        setResendError(err.message)
      } else {
        setResendError('Error al solicitar un nuevo enlace. Intenta más tarde.')
      }
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Verificación de Correo
        </h1>
        <p className="text-sm text-slate-400 mt-1.5">
          Protegiendo la privacidad de su espacio
        </p>
      </div>

      <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
        {isVerified ? (
          /* Case A: Success */
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-white">
                ¡Correo verificado con éxito!
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Tu cuenta está completamente validada y segura.
              </p>
            </div>

            <div className="pt-2">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => void navigate({ to: '/' })}
                  className="specular-button w-full py-3.5 rounded-2xl text-white font-medium text-sm flex items-center justify-center cursor-pointer"
                >
                  Continuar a nuestro espacio
                </button>
              ) : (
                <Link
                  to="/login"
                  className="specular-button w-full py-3.5 rounded-2xl text-white font-medium text-sm inline-flex items-center justify-center"
                >
                  Iniciar sesión
                </Link>
              )}
            </div>
          </div>
        ) : verifyError || !token ? (
          /* Case B: Invalid or expired token -> Dual Recovery Flow */
          <div className="space-y-5">
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="font-semibold">
                  {!token ? 'Enlace incompleto' : 'Enlace expirado o inválido'}
                </p>
                <p className="text-amber-300/80 mt-0.5">
                  {!token
                    ? 'No detectamos un token en la dirección del enlace.'
                    : 'Este enlace de verificación ya fue utilizado o ha caducado.'}
                </p>
              </div>
            </div>

            {resendSuccess ? (
              <div className="text-center space-y-3 py-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-300">
                  Hemos enviado un nuevo enlace a tu correo. Revisa tu bandeja de entrada o spam.
                </p>
                {isAuthenticated && (
                  <Link
                    to="/"
                    className="inline-block text-xs text-rose-400 hover:text-rose-300 font-medium"
                  >
                    Volver a mi espacio
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {resendError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
                    {resendError}
                  </div>
                )}

                {isAuthenticated && user ? (
                  /* Authenticated 1-click resend without typing email */
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300">
                      ¿Deseas que te enviemos un nuevo enlace a <span className="font-semibold text-white">{user.email}</span>?
                    </p>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={isResending}
                      className="specular-button w-full py-3 rounded-2xl text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isResending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enviando enlace...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Reenviar nuevo enlace</span>
                        </>
                      )}
                    </button>
                    <div className="text-center">
                      <Link
                        to="/"
                        className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        Ir a mi espacio por ahora
                      </Link>
                    </div>
                  </div>
                ) : (
                  /* Unauthenticated resend: provide email field */
                  <form onSubmit={handleResend} className="space-y-3">
                    <p className="text-xs text-slate-300">
                      Ingresa tu correo para recibir un nuevo enlace de activación:
                    </p>
                    <div className="relative">
                      <Mail
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        type="email"
                        required
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="tu@correo.com"
                        className="glass-input w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs text-white placeholder-slate-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isResending || !resendEmail}
                      className="specular-button w-full py-3 rounded-2xl text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isResending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Solicitando enlace...</span>
                        </>
                      ) : (
                        <span>Enviar nuevo enlace</span>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Case C: Valid initial token state -> Interactive POST Confirmation */
          <div className="text-center space-y-5 py-2">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-white">
                Confirma tu correo
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Presiona el botón a continuación para verificar tu cuenta y activar la sincronización completa.
              </p>
            </div>

            <button
              type="button"
              onClick={handleVerify}
              disabled={isVerifying}
              className="specular-button w-full py-3.5 rounded-2xl text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verificando tu cuenta...</span>
                </>
              ) : (
                <span>Confirmar mi correo</span>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="text-center mt-6">
        <Link
          to="/"
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          Volver a la aplicación
        </Link>
      </div>
    </div>
  )
}