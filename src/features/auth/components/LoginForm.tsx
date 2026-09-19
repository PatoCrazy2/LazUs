import { Link } from '@tanstack/react-router'
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { LoginInputSchema } from '../../../../shared'
import { AuthApiError } from '../api/auth.api'
import { useAuth } from '../hooks/useAuth'
import { useRetryAfterCountdown } from '../hooks/useRetryAfterCountdown'
import { GoogleAuthButton } from './GoogleAuthButton'

export function LoginForm() {
  const { login, isLoggingIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const { isRateLimited, formattedTime, startCountdown } = useRetryAfterCountdown()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isRateLimited || isLoggingIn) return

    setServerError(null)
    setFieldErrors({})

    const validation = LoginInputSchema.safeParse({ email, password })
    if (!validation.success) {
      const issues = validation.error.flatten().fieldErrors
      setFieldErrors({
        email: issues.email?.[0],
        password: issues.password?.[0],
      })
      return
    }

    try {
      await login(validation.data)
      // On success, AppRouter responds to auth state changes via router.invalidate() and navigates to '/'
    } catch (err: unknown) {
      if (err instanceof AuthApiError) {
        if (err.status === 429 && err.retryAfter) {
          startCountdown(err.retryAfter)
          setServerError(
            `Demasiados intentos de acceso. Por seguridad, espera ${err.retryAfter} segundos antes de volver a intentar.`
          )
          return
        }
        setServerError(err.message)
      } else {
        setServerError('No pudimos conectar con el servidor. Revisa tu conexión.')
      }
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Bienvenido a LazUs
        </h1>
        <p className="text-sm text-slate-400 mt-1.5">
          El espacio íntimo donde solo existen ustedes dos
        </p>
      </div>

      <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
        {/* Google OAuth Option */}
        <GoogleAuthButton disabled={isLoggingIn || isRateLimited} />

        <div className="relative flex items-center justify-center">
          <div className="border-t border-white/10 w-full" />
          <span className="bg-[#0f172a]/90 px-3 text-[11px] font-medium tracking-wider uppercase text-slate-400 shrink-0">
            o con tu correo
          </span>
        </div>

        {/* 429 Rate Limit Warning Banner */}
        {isRateLimited && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2.5 animate-pulse"
          >
            <Lock className="w-4 h-4 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">Acceso pausado por seguridad</p>
              <p className="text-amber-300/80">
                Podrás reintentar en <span className="font-mono font-bold">{formattedTime}</span>
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
          {/* Email Field */}
          <div>
            <label htmlFor="login-email" className="sr-only">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }))
                }}
                disabled={isLoggingIn || isRateLimited}
                placeholder="tu@correo.com"
                className={`glass-input w-full pl-10 pr-4 py-3 rounded-2xl text-sm text-white placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                  fieldErrors.email ? 'border-rose-500/60 focus:border-rose-500' : ''
                }`}
              />
            </div>
            {fieldErrors.email && (
              <p className="text-rose-400 text-xs mt-1.5 pl-1">{fieldErrors.email}</p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="login-password" className="sr-only">
                Contraseña
              </label>
            </div>
            <div className="relative">
              <Lock
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }))
                  }
                }}
                disabled={isLoggingIn || isRateLimited}
                placeholder="Tu contraseña"
                className={`glass-input w-full pl-10 pr-11 py-3 rounded-2xl text-sm text-white placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                  fieldErrors.password ? 'border-rose-500/60 focus:border-rose-500' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-rose-400 text-xs mt-1.5 pl-1">{fieldErrors.password}</p>
            )}
            <div className="flex justify-end mt-1.5">
              <Link
                to="/forgot-password"
                className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoggingIn || isRateLimited}
            className="specular-button w-full py-3.5 rounded-2xl text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Iniciando sesión...</span>
              </>
            ) : isRateLimited ? (
              <span>Espera {formattedTime}</span>
            ) : (
              <span>Entrar a LazUs</span>
            )}
          </button>
        </form>
      </div>

      {/* Switch to Register */}
      <p className="text-center text-xs text-slate-400 mt-6">
        ¿Aún no tienen su espacio?{' '}
        <Link
          to="/register"
          className="font-semibold text-rose-400 hover:text-rose-300 underline underline-offset-4"
        >
          Crear cuenta
        </Link>
      </p>
    </div>
  )
}