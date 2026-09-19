import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Check, Eye, EyeOff, Loader2, Lock, Mail, User, X } from 'lucide-react'
import React, { useState } from 'react'
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
    <div className="w-full max-w-[390px] mx-auto flex-1 flex flex-col justify-between py-2">
      {/* Encabezado Stitch */}
      <section className="space-y-4">
        <div className="text-center pt-8 pb-3 space-y-1.5">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight text-[#18181B]">
            Crea tu cuenta
          </h1>
          <p className="text-[15px] font-normal text-[#71717A] tracking-normal">
            El espacio compartido para los dos comienza aquí.
          </p>
        </div>
      </section>

      {/* Formulario */}
      <section className="space-y-4 my-auto pt-1 pb-1">
        <div className="space-y-4 pt-1">
          {/* Botón de Google */}
          <GoogleAuthButton
            label="Registrarse con Google"
            disabled={isRegistering || isRateLimited}
          />

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
                <p className="font-semibold">Registro pausado por seguridad</p>
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
            {/* Display Name Field */}
            <div>
              <div
                className={`bg-white/50 backdrop-blur-md border rounded-[15px] px-3.5 h-12 flex items-center gap-3 shadow-sm focus-within:border-[#18181B]/40 focus-within:bg-white transition-all ${
                  fieldErrors.displayName ? 'border-rose-500/60' : 'border-[#EAEAEA]/80'
                }`}
              >
                <User className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
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
                  placeholder="Tu nombre"
                  className="w-full bg-transparent border-0 p-0 text-[14.5px] text-[#18181B] placeholder-[#A1A1AA] focus:ring-0 focus:outline-none disabled:opacity-50"
                />
              </div>
              {fieldErrors.displayName && (
                <p className="text-rose-600 text-xs mt-1 pl-1 font-medium">{fieldErrors.displayName}</p>
              )}
            </div>

            {/* Email Field */}
            <div>
              <div
                className={`bg-white/50 backdrop-blur-md border rounded-[15px] px-3.5 h-12 flex items-center gap-3 shadow-sm focus-within:border-[#18181B]/40 focus-within:bg-white transition-all ${
                  fieldErrors.email ? 'border-rose-500/60' : 'border-[#EAEAEA]/80'
                }`}
              >
                <Mail className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
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
                  className="w-full bg-transparent border-0 p-0 text-[14.5px] text-[#18181B] placeholder-[#A1A1AA] focus:ring-0 focus:outline-none disabled:opacity-50"
                />
              </div>
              {fieldErrors.email && (
                <p className="text-rose-600 text-xs mt-1 pl-1 font-medium">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div
                className={`bg-white/50 backdrop-blur-md border rounded-[15px] px-3.5 h-12 flex items-center gap-3 shadow-sm focus-within:border-[#18181B]/40 focus-within:bg-white transition-all ${
                  fieldErrors.password ? 'border-rose-500/60' : 'border-[#EAEAEA]/80'
                }`}
              >
                <Lock className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
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
                  placeholder="Crea una contraseña"
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

              {/* Password strength checklist (Stitch light style) */}
              <div className="mt-2.5 p-3 rounded-[15px] bg-white/60 backdrop-blur-sm border border-[#EAEAEA]/80 space-y-1.5 text-[11.5px]">
                <div className="flex items-center gap-1.5">
                  {hasMinLength ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-[#A1A1AA]" />
                  )}
                  <span className={hasMinLength ? 'text-emerald-800 font-medium' : 'text-[#71717A]'}>
                    Al menos 8 caracteres
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasLetter ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-[#A1A1AA]" />
                  )}
                  <span className={hasLetter ? 'text-emerald-800 font-medium' : 'text-[#71717A]'}>
                    Al menos una letra
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasNumber ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-[#A1A1AA]" />
                  )}
                  <span className={hasNumber ? 'text-emerald-800 font-medium' : 'text-[#71717A]'}>
                    Al menos un número
                  </span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={isRegistering || isRateLimited}
                className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Creando tu cuenta...</span>
                  </>
                ) : isRateLimited ? (
                  <span>Espera {formattedTime}</span>
                ) : (
                  <>
                    <span>Crear cuenta</span>
                    <ArrowRight className="w-4 h-4 text-white/90" strokeWidth={2} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Switch to Login */}
      <footer className="pt-2 pb-1 space-y-1.5 text-center">
        <p className="text-[13px] text-[#71717A]">
          ¿Ya tienes una cuenta?
          <Link
            to="/login"
            className="font-medium text-[#18181B] hover:underline underline-offset-2 ml-1"
          >
            Iniciar sesión
          </Link>
        </p>
      </footer>
    </div>
  )
}