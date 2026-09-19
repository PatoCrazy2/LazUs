import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Mail, Send, ShieldCheck } from 'lucide-react'
import React, { useEffect, useState } from 'react'
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
    <div className="w-full max-w-[390px] mx-auto flex-1 flex flex-col justify-between py-2">
      {/* Encabezado Stitch */}
      <section className="space-y-4">
        <div className="text-center pt-8 pb-3 space-y-1.5">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight text-[#18181B]">
            Verificación de Correo
          </h1>
          <p className="text-[15px] font-normal text-[#71717A] tracking-normal">
            Protegiendo la privacidad de su espacio
          </p>
        </div>
      </section>

      {/* Contenido principal */}
      <section className="space-y-4 my-auto pt-1 pb-1">
        {isVerified ? (
          /* Case A: Success */
          <div className="text-center space-y-5 py-4 px-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-[#18181B]">
                ¡Correo verificado con éxito!
              </h2>
              <p className="text-[13.5px] text-[#71717A] leading-relaxed">
                Tu cuenta está completamente validada y segura.
              </p>
            </div>

            <div className="pt-2">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => void navigate({ to: '/' })}
                  className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer"
                >
                  <span>Continuar a nuestro espacio</span>
                  <ArrowRight className="w-4 h-4 text-white/90" strokeWidth={2} />
                </button>
              ) : (
                <Link
                  to="/login"
                  className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight inline-flex items-center justify-center gap-2 active:scale-[0.985] transition-transform"
                >
                  <span>Iniciar sesión</span>
                  <ArrowRight className="w-4 h-4 text-white/90" strokeWidth={2} />
                </Link>
              )}
            </div>
          </div>
        ) : verifyError || !token ? (
          /* Case B: Invalid or expired token -> Dual Recovery Flow */
          <div className="space-y-4 pt-1">
            <div className="flex items-start gap-3 p-3.5 rounded-[15px] bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold">
                  {!token ? 'Enlace incompleto' : 'Enlace expirado o inválido'}
                </p>
                <p className="text-amber-800/90 mt-0.5">
                  {!token
                    ? 'No detectamos un token en la dirección del enlace.'
                    : 'Este enlace de verificación ya fue utilizado o ha caducado.'}
                </p>
              </div>
            </div>

            {resendSuccess ? (
              <div className="text-center space-y-3 py-4 px-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-[13.5px] text-[#71717A]">
                  Hemos enviado un nuevo enlace a tu correo. Revisa tu bandeja de entrada o spam.
                </p>
                {isAuthenticated && (
                  <Link
                    to="/"
                    className="inline-block text-[13px] text-[#18181B] font-medium hover:underline underline-offset-2"
                  >
                    Volver a mi espacio
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {resendError && (
                  <div className="p-3 rounded-[15px] bg-rose-500/10 border border-rose-500/20 text-rose-800 text-xs font-medium">
                    {resendError}
                  </div>
                )}

                {isAuthenticated && user ? (
                  /* Authenticated 1-click resend without typing email */
                  <div className="space-y-3">
                    <p className="text-[13.5px] text-[#71717A]">
                      ¿Deseas que te enviemos un nuevo enlace a <span className="font-semibold text-[#18181B]">{user.email}</span>?
                    </p>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={isResending}
                      className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer disabled:opacity-50"
                    >
                      {isResending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Enviando enlace...</span>
                        </>
                      ) : (
                        <>
                          <span>Reenviar nuevo enlace</span>
                          <Send className="w-4 h-4 text-white/90" strokeWidth={1.8} />
                        </>
                      )}
                    </button>
                    <div className="text-center pt-1">
                      <Link
                        to="/"
                        className="text-[13px] text-[#71717A] hover:text-[#18181B] transition-colors"
                      >
                        Ir a mi espacio por ahora
                      </Link>
                    </div>
                  </div>
                ) : (
                  /* Unauthenticated resend: provide email field */
                  <form onSubmit={handleResend} className="space-y-3">
                    <p className="text-[13.5px] text-[#71717A]">
                      Ingresa tu correo para recibir un nuevo enlace de activación:
                    </p>
                    <div className="bg-white/50 backdrop-blur-md border border-[#EAEAEA]/80 rounded-[15px] px-3.5 h-12 flex items-center gap-3 shadow-sm focus-within:border-[#18181B]/40 focus-within:bg-white transition-all">
                      <Mail
                        className="w-4 h-4 text-[#A1A1AA] flex-shrink-0"
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      <input
                        type="email"
                        required
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="tu@correo.com"
                        className="w-full bg-transparent border-0 p-0 text-[14.5px] text-[#18181B] placeholder-[#A1A1AA] focus:ring-0 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isResending || !resendEmail}
                      className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer disabled:opacity-50"
                    >
                      {isResending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Solicitando enlace...</span>
                        </>
                      ) : (
                        <>
                          <span>Enviar nuevo enlace</span>
                          <Send className="w-4 h-4 text-white/90" strokeWidth={1.8} />
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Case C: Valid initial token state -> Interactive POST Confirmation */
          <div className="text-center space-y-5 py-4 px-2">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-[#18181B]">
                Confirma tu correo
              </h2>
              <p className="text-[13.5px] text-[#71717A] leading-relaxed">
                Presiona el botón a continuación para verificar tu cuenta y activar la sincronización completa.
              </p>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleVerify}
                disabled={isVerifying}
                className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer disabled:opacity-50"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Verificando tu cuenta...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar mi correo</span>
                    <ArrowRight className="w-4 h-4 text-white/90" strokeWidth={2} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="pt-2 pb-1 text-center">
        <Link
          to="/"
          className="text-[13px] text-[#71717A] hover:text-[#18181B] transition-colors"
        >
          Volver a la aplicación
        </Link>
      </footer>
    </div>
  )
}