import { Link } from '@tanstack/react-router'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import React, { useState } from 'react'
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
    <div className="w-full max-w-[390px] mx-auto flex-1 flex flex-col justify-between py-2">
      {/* Encabezado Stitch */}
      <section className="space-y-4">
        <div className="text-center pt-8 pb-3 space-y-1.5">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight text-[#18181B]">
            LazUs
          </h1>
          <p className="text-[15px] font-normal text-[#71717A] tracking-normal">
            El espacio compartido para los dos.
          </p>
        </div>
      </section>

      {/* Formulario y Controles */}
      <section className="space-y-4 my-auto pt-1 pb-1">
        <div className="space-y-4 pt-1">
          {/* Botón de Google */}
          <GoogleAuthButton disabled={isLoggingIn || isRateLimited} />

          {/* Separador "o" */}
          <div className="relative py-0.5 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#EAEAEA]/70" />
            </div>
            <span className="relative bg-white/80 backdrop-blur-sm px-3 text-[12px] text-[#A1A1AA] font-mono">
              o
            </span>
          </div>

          {/* 429 Rate Limit Warning Banner */}
          {isRateLimited && (
            <div
              role="alert"
              className="p-3.5 rounded-[15px] bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs flex items-center gap-2.5 animate-pulse"
            >
              <Lock className="w-4 h-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">Acceso pausado por seguridad</p>
                <p className="text-amber-800/90">
                  Podrás reintentar en <span className="font-mono font-bold">{formattedTime}</span>
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

          {/* Campos de texto */}
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {/* Correo */}
            <div>
              <div
                className={`bg-white/50 backdrop-blur-md border rounded-[15px] px-3.5 h-12 flex items-center gap-3 shadow-sm focus-within:border-[#18181B]/40 focus-within:bg-white transition-all ${
                  fieldErrors.email ? 'border-rose-500/60' : 'border-[#EAEAEA]/80'
                }`}
              >
                <Mail className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
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
                  placeholder="tu@lazus.app"
                  className="w-full bg-transparent border-0 p-0 text-[14.5px] text-[#18181B] placeholder-[#A1A1AA] focus:ring-0 focus:outline-none disabled:opacity-50"
                />
              </div>
              {fieldErrors.email && (
                <p className="text-rose-600 text-xs mt-1 pl-1 font-medium">{fieldErrors.email}</p>
              )}
            </div>

            {/* Contraseña */}
            <div>
              <div
                className={`bg-white/50 backdrop-blur-md border rounded-[15px] px-3.5 h-12 flex items-center gap-3 shadow-sm focus-within:border-[#18181B]/40 focus-within:bg-white transition-all ${
                  fieldErrors.password ? 'border-rose-500/60' : 'border-[#EAEAEA]/80'
                }`}
              >
                <Lock className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }))
                  }}
                  disabled={isLoggingIn || isRateLimited}
                  placeholder="Llave privada de acceso"
                  className="w-full bg-transparent border-0 p-0 text-[14.5px] text-[#18181B] placeholder-[#A1A1AA] focus:ring-0 focus:outline-none disabled:opacity-50"
                />
                {/* Control interactivo con contraste WCAG 1.4.11 (>= 3:1) */}
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  className="text-[#71717A] hover:text-[#18181B] focus:text-[#18181B] p-1 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" strokeWidth={1.8} />
                  ) : (
                    <Eye className="w-4 h-4" strokeWidth={1.8} />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-rose-600 text-xs mt-1 pl-1 font-medium">{fieldErrors.password}</p>
              )}
            </div>

            <div className="flex justify-end pt-0.5">
              <Link
                to="/forgot-password"
                className="text-[12.5px] text-[#71717A] hover:text-[#18181B] transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            {/* Botón Acceder */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={isLoggingIn || isRateLimited}
                className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Iniciando sesión...</span>
                  </>
                ) : isRateLimited ? (
                  <span>Espera {formattedTime}</span>
                ) : (
                  <>
                    <span>Acceder</span>
                    <ArrowRight className="w-4 h-4 text-white/90" strokeWidth={2} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Footer Stitch */}
      <footer className="pt-2 pb-1 space-y-1.5 text-center">
        <p className="text-[13px] text-[#71717A]">
          ¿Aún no tienen su espacio?
          <Link
            to="/register"
            className="font-medium text-[#18181B] hover:underline underline-offset-2 ml-1"
          >
            Vincular pareja
          </Link>
        </p>
        <p className="text-[11px] text-[#A1A1AA]">
          Al continuar aceptas los{' '}
          <span className="underline underline-offset-2 hover:text-[#71717A] cursor-pointer">
            Términos y Condiciones
          </span>
        </p>
      </footer>
    </div>
  )
}