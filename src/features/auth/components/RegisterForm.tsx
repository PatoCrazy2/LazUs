import { Link, useNavigate } from '@tanstack/react-router'
import { Check, Eye, EyeOff, Loader2, Lock, Mail, User, X } from 'lucide-react'
import { useState } from 'react'
import { RegisterInputSchema } from '../../../../shared'
import { AuthApiError } from '../api/auth.api'
import { useAuth } from '../hooks/useAuth'
import { useRetryAfterCountdown } from '../hooks/useRetryAfterCountdown'
import { GoogleAuthButton } from './GoogleAuthButton'

export function RegisterForm() {
  const { register, isRegistering } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string
    email?: string
    password?: string
  }>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const { isRateLimited, formattedTime, startCountdown } = useRetryAfterCountdown()

  // Real-time password criteria
  const hasMinLength = password.length >= 8
  const hasLetter = /[A-Za-z]/.test(password)
  const hasNumber = /\d/.test(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isRateLimited || isRegistering) return

    setServerError(null)
    setFieldErrors({})

    const validation = RegisterInputSchema.safeParse({ displayName, email, password })
    if (!validation.success) {
      const issues = validation.error.flatten().fieldErrors
      setFieldErrors({
        displayName: issues.displayName?.[0],
        email: issues.email?.[0],
        password: issues.password?.[0],
      })
      return
    }

    try {
      await register(validation.data)
      // Navigate to authenticated root with unverified email banner
      void navigate({ to: '/' })
    } catch (err: unknown) {
      if (err instanceof AuthApiError) {
        if (err.status === 429 && err.retryAfter) {
          startCountdown(err.retryAfter)
          setServerError(
            `Demasiadas solicitudes de registro. Por seguridad, espera ${err.retryAfter} segundos.`
          )
          return
        }
        setServerError(err.message)
      } else {
        setServerError('No se pudo conectar con el servidor. Verifica tu conexión.')
      }
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Crea tu espacio
        </h1>
        <p className="text-sm text-slate-400 mt-1.5">
          Comienza una historia íntima y privada con tu pareja
        </p>
      </div>

      <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
        {/* Google OAuth Option */}
        <GoogleAuthButton
          label="Registrarse con Google"
          disabled={isRegistering || isRateLimited}
        />

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
              <p className="font-semibold">Registro pausado por seguridad</p>
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
          {/* Display Name Field */}
          <div>
            <label htmlFor="register-name" className="sr-only">
              Tu nombre o apodo
            </label>
            <div className="relative">
              <User
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  if (fieldErrors.displayName) {
                    setFieldErrors((prev) => ({ ...prev, displayName: undefined }))
                  }
                }}
                disabled={isRegistering || isRateLimited}
                placeholder="¿Cómo te llama tu pareja?"
                className={`glass-input w-full pl-10 pr-4 py-3 rounded-2xl text-sm text-white placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                  fieldErrors.displayName ? 'border-rose-500/60 focus:border-rose-500' : ''
                }`}
              />
            </div>
            {fieldErrors.displayName && (
              <p className="text-rose-400 text-xs mt-1.5 pl-1">{fieldErrors.displayName}</p>
            )}
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="register-email" className="sr-only">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }))
                  }
                }}
                disabled={isRegistering || isRateLimited}
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
            <label htmlFor="register-password" className="sr-only">
              Contraseña
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }))
                  }
                }}
                disabled={isRegistering || isRateLimited}
                placeholder="Crea una contraseña segura"
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

            {/* Password strength checklist */}
            <div className="mt-3 p-3 rounded-xl bg-slate-900/40 border border-white/5 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5">
                {hasMinLength ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <X className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className={hasMinLength ? 'text-emerald-300' : 'text-slate-400'}>
                  Al menos 8 caracteres
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {hasLetter ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <X className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className={hasLetter ? 'text-emerald-300' : 'text-slate-400'}>
                  Al menos una letra
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {hasNumber ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <X className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className={hasNumber ? 'text-emerald-300' : 'text-slate-400'}>
                  Al menos un número
                </span>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isRegistering || isRateLimited}
            className="specular-button w-full py-3.5 rounded-2xl text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isRegistering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creando tu espacio...</span>
              </>
            ) : isRateLimited ? (
              <span>Espera {formattedTime}</span>
            ) : (
              <span>Crear cuenta</span>
            )}
          </button>
        </form>
      </div>

      {/* Switch to Login */}
      <p className="text-center text-xs text-slate-400 mt-6">
        ¿Ya tienen una cuenta?{' '}
        <Link
          to="/login"
          className="font-semibold text-rose-400 hover:text-rose-300 underline underline-offset-4"
        >
          Iniciar sesión
        </Link>
      </p>
    </div>
  )
}