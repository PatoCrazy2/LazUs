import { Link } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, Loader2, Lock, Mail, Send } from 'lucide-react'
import React, { useState } from 'react'
import { ForgotPasswordInputSchema } from '../../../../shared'
import { AuthApiError, authApi } from '../api/auth.api'
import { useRetryAfterCountdown } from '../hooks/useRetryAfterCountdown'

export function ForgotPasswordModal() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const { isRateLimited, formattedTime, startCountdown } = useRetryAfterCountdown()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isRateLimited || isSubmitting) return

    setFieldError(null)
    setServerError(null)

    const validation = ForgotPasswordInputSchema.safeParse({ email })
    if (!validation.success) {
      setFieldError(validation.error.flatten().fieldErrors.email?.[0] || 'Correo no válido')
      return
    }

    setIsSubmitting(true)
    try {
      await authApi.forgotPassword(validation.data)
      // Canonical Zero-Leak policy: Always present positive feedback regardless of user existence
      setIsSubmitted(true)
    } catch (err: unknown) {
      if (err instanceof AuthApiError) {
        if (err.status === 429 && err.retryAfter) {
          startCountdown(err.retryAfter)
          setServerError(
            `Demasiadas solicitudes. Por seguridad, espera ${err.retryAfter} segundos.`
          )
          return
        }
        setServerError(err.message)
      } else {
        setServerError('No se pudo procesar la solicitud. Revisa tu conexión.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-[390px] mx-auto flex-1 flex flex-col justify-between py-2">
      {/* Encabezado */}
      <section className="space-y-4">
        <div className="text-center pt-8 pb-3 space-y-1.5">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight text-[#18181B]">
            Recuperar Contraseña
          </h1>
          <p className="text-[15px] font-normal text-[#71717A] tracking-normal">
            Te enviaremos un enlace seguro para restablecer tu acceso
          </p>
        </div>
      </section>

      {/* Contenido principal */}
      <section className="space-y-4 my-auto pt-1 pb-1">
        {isSubmitted ? (
          <div className="text-center space-y-5 py-4 px-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-[#18181B]">
                Revisa tu bandeja de entrada
              </h2>
              <p className="text-[13.5px] text-[#71717A] leading-relaxed">
                Si existe una cuenta asociada a <span className="font-medium text-[#18181B]">{email}</span>, hemos enviado un enlace de recuperación.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to="/login"
                className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight inline-flex items-center justify-center gap-2 active:scale-[0.985] transition-transform"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* 429 Rate Limit Warning Banner */}
            {isRateLimited && (
              <div
                role="alert"
                className="p-3.5 rounded-[15px] bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs flex items-center gap-2.5 animate-pulse"
              >
                <Lock className="w-4 h-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">Solicitudes en pausa</p>
                  <p className="text-amber-800/90">
                    Podrás volver a intentar en <span className="font-mono font-bold">{formattedTime}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Server Error Message */}
            {serverError && !isRateLimited && (
              <div
                role="alert"
                className="p-3 rounded-[15px] bg-rose-500/10 border border-rose-500/20 text-rose-800 text-xs font-medium"
              >
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div>
                <div
                  className={`bg-white/50 backdrop-blur-md border rounded-[15px] px-3.5 h-12 flex items-center gap-3 shadow-sm focus-within:border-[#18181B]/40 focus-within:bg-white transition-all ${
                    fieldError ? 'border-rose-500/60' : 'border-[#EAEAEA]/80'
                  }`}
                >
                  <Mail className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (fieldError) setFieldError(null)
                    }}
                    disabled={isSubmitting || isRateLimited}
                    placeholder="tu@correo.com"
                    className="w-full bg-transparent border-0 p-0 text-[14.5px] text-[#18181B] placeholder-[#A1A1AA] focus:ring-0 focus:outline-none disabled:opacity-50"
                  />
                </div>
                {fieldError && (
                  <p className="text-rose-600 text-xs mt-1 pl-1 font-medium">{fieldError}</p>
                )}
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || isRateLimited}
                  className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Enviando enlace...</span>
                    </>
                  ) : isRateLimited ? (
                    <span>Espera {formattedTime}</span>
                  ) : (
                    <>
                      <span>Enviar instrucciones</span>
                      <Send className="w-4 h-4 text-white/90" strokeWidth={1.8} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="pt-2 pb-1 text-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-[13px] text-[#71717A] hover:text-[#18181B] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al inicio de sesión
        </Link>
      </footer>
    </div>
  )
}