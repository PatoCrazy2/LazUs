import { Link } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
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
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Recuperar Contraseña
        </h1>
        <p className="text-sm text-slate-400 mt-1.5">
          Te enviaremos un enlace seguro para restablecer tu acceso
        </p>
      </div>

      <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
        {isSubmitted ? (
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-white">
                Revisa tu bandeja de entrada
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Si existe una cuenta asociada a <span className="font-medium text-white">{email}</span>, hemos enviado un enlace de recuperación.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to="/login"
                className="specular-button w-full py-3.5 rounded-2xl text-white font-medium text-sm inline-flex items-center justify-center gap-2"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* 429 Rate Limit Warning Banner */}
            {isRateLimited && (
              <div
                role="alert"
                className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2.5 animate-pulse"
              >
                <Lock className="w-4 h-4 shrink-0 text-amber-400" />
                <div>
                  <p className="font-semibold">Solicitudes en pausa</p>
                  <p className="text-amber-300/80">
                    Podrás volver a intentar en <span className="font-mono font-bold">{formattedTime}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Server Error Message */}
            {serverError && !isRateLimited && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium"
              >
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="forgot-email" className="sr-only">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                    aria-hidden="true"
                  />
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
                    className={`glass-input w-full pl-10 pr-4 py-3 rounded-2xl text-sm text-white placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                      fieldError ? 'border-rose-500/60 focus:border-rose-500' : ''
                    }`}
                  />
                </div>
                {fieldError && (
                  <p className="text-rose-400 text-xs mt-1.5 pl-1">{fieldError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isRateLimited}
                className="specular-button w-full py-3.5 rounded-2xl text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enviando enlace...</span>
                  </>
                ) : isRateLimited ? (
                  <span>Espera {formattedTime}</span>
                ) : (
                  <span>Enviar instrucciones</span>
                )}
              </button>
            </form>
          </>
        )}
      </div>

      <div className="text-center mt-6">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  )
}