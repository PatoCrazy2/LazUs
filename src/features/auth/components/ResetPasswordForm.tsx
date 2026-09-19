import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowRight, Check, CheckCircle2, Eye, EyeOff, Loader2, Lock, X } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { ResetPasswordInputSchema } from '../../../../shared'
import { AuthApiError, authApi } from '../api/auth.api'
import { authStore } from '../store/auth.store'

export function ResetPasswordForm() {
  const navigate = useNavigate()
  // Extract token from search params: /reset-password?token=...
  const search = useSearch({ strict: false }) as { token?: string }

  // Retain token in memory ref, then purge it from URL immediately
  const tokenRef = useRef<string>(search.token || '')
  const [hasPurgedUrl, setHasPurgedUrl] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    newPassword?: string
    confirmPassword?: string
  }>({})
  const [serverError, setServerError] = useState<string | null>(null)

  // Real-time criteria for new password
  const hasMinLength = newPassword.length >= 8
  const hasLetter = /[A-Za-z]/.test(newPassword)
  const hasNumber = /\d/.test(newPassword)
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  // 1.4: Purga sincronizada del token con TanStack Router
  useEffect(() => {
    if (search.token && !hasPurgedUrl) {
      tokenRef.current = search.token
      setHasPurgedUrl(true)
      void navigate({ to: '/reset-password', search: {}, replace: true })
    }
  }, [search.token, hasPurgedUrl, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    setServerError(null)
    setFieldErrors({})

    if (!tokenRef.current) {
      setServerError('No se encontró un token de recuperación válido o el enlace ya expiró.')
      return
    }

    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Las contraseñas no coinciden' })
      return
    }

    const validation = ResetPasswordInputSchema.safeParse({
      token: tokenRef.current,
      newPassword,
    })

    if (!validation.success) {
      const issues = validation.error.flatten().fieldErrors
      setFieldErrors({
        newPassword: issues.newPassword?.[0],
      })
      return
    }

    setIsSubmitting(true)
    try {
      const result = await authApi.resetPassword(validation.data)
      // Save newly authenticated session user locally in Dexie
      if (result.user) {
        await authStore.saveProfile(result.user)
      }
      setIsSuccess(true)
    } catch (err: unknown) {
      if (err instanceof AuthApiError) {
        setServerError(err.message)
      } else {
        setServerError('No pudimos restablecer tu contraseña. Inténtalo de nuevo.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-[390px] mx-auto flex-1 flex flex-col justify-between py-2">
      {/* Encabezado Stitch */}
      <section className="space-y-4">
        <div className="text-center pt-8 pb-3 space-y-1.5">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight text-[#18181B]">
            Nueva Contraseña
          </h1>
          <p className="text-[15px] font-normal text-[#71717A] tracking-normal">
            Crea una nueva clave privada para tu cuenta
          </p>
        </div>
      </section>

      {/* Contenido principal */}
      <section className="space-y-4 my-auto pt-1 pb-1">
        {isSuccess ? (
          <div className="text-center space-y-5 py-4 px-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-[#18181B]">
                Contraseña restablecida con éxito
              </h2>
              <p className="text-[13.5px] text-[#71717A] leading-relaxed">
                Tu clave ha sido actualizada y tu sesión está activa.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to="/"
                className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight inline-flex items-center justify-center gap-2 active:scale-[0.985] transition-transform"
              >
                <span>Continuar a nuestro espacio</span>
                <ArrowRight className="w-4 h-4 text-white/90" strokeWidth={2} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {serverError && (
              <div
                role="alert"
                className="p-3 rounded-[15px] bg-rose-500/10 border border-rose-500/20 text-rose-800 text-xs font-medium"
              >
                {serverError}
              </div>
            )}

            {!tokenRef.current && !search.token ? (
              <div className="text-center space-y-4 py-4 px-2">
                <p className="text-[13.5px] text-[#71717A]">
                  El enlace es inválido o no contiene un token de recuperación.
                </p>
                <Link
                  to="/forgot-password"
                  className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight inline-flex items-center justify-center active:scale-[0.985] transition-transform"
                >
                  Solicitar nuevo enlace
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3" noValidate>
                {/* New Password Field */}
                <div>
                  <div
                    className={`bg-white/50 backdrop-blur-md border rounded-[15px] px-3.5 h-12 flex items-center gap-3 shadow-sm focus-within:border-[#18181B]/40 focus-within:bg-white transition-all ${
                      fieldErrors.newPassword ? 'border-rose-500/60' : 'border-[#EAEAEA]/80'
                    }`}
                  >
                    <Lock className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    <input
                      id="reset-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value)
                        if (fieldErrors.newPassword) {
                          setFieldErrors((prev) => ({ ...prev, newPassword: undefined }))
                        }
                      }}
                      disabled={isSubmitting}
                      placeholder="Nueva contraseña"
                      className="w-full bg-transparent border-0 p-0 text-[14.5px] text-[#18181B] placeholder-[#A1A1AA] focus:ring-0 focus:outline-none disabled:opacity-50"
                    />
                    {/* Control interactivo con contraste WCAG 1.4.11 (>= 3:1) */}
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      aria-label={showNewPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      className="text-[#71717A] hover:text-[#18181B] focus:text-[#18181B] p-1 transition-colors cursor-pointer"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" strokeWidth={1.8} />
                      ) : (
                        <Eye className="w-4 h-4" strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                  {fieldErrors.newPassword && (
                    <p className="text-rose-600 text-xs mt-1 pl-1 font-medium">
                      {fieldErrors.newPassword}
                    </p>
                  )}
                </div>

                {/* Confirm Password Field */}
                <div>
                  <div
                    className={`bg-white/50 backdrop-blur-md border rounded-[15px] px-3.5 h-12 flex items-center gap-3 shadow-sm focus-within:border-[#18181B]/40 focus-within:bg-white transition-all ${
                      fieldErrors.confirmPassword ? 'border-rose-500/60' : 'border-[#EAEAEA]/80'
                    }`}
                  >
                    <Lock className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        if (fieldErrors.confirmPassword) {
                          setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                        }
                      }}
                      disabled={isSubmitting}
                      placeholder="Confirma la contraseña"
                      className="w-full bg-transparent border-0 p-0 text-[14.5px] text-[#18181B] placeholder-[#A1A1AA] focus:ring-0 focus:outline-none disabled:opacity-50"
                    />
                    {/* Control interactivo con contraste WCAG 1.4.11 (>= 3:1) */}
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      className="text-[#71717A] hover:text-[#18181B] focus:text-[#18181B] p-1 transition-colors cursor-pointer"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" strokeWidth={1.8} />
                      ) : (
                        <Eye className="w-4 h-4" strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="text-rose-600 text-xs mt-1 pl-1 font-medium">
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>

                {/* Password Criteria indicators (Stitch light style) */}
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
                    {hasLetter && hasNumber ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-[#A1A1AA]" />
                    )}
                    <span
                      className={hasLetter && hasNumber ? 'text-emerald-800 font-medium' : 'text-[#71717A]'}
                    >
                      Al menos una letra y un número
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {passwordsMatch ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-[#A1A1AA]" />
                    )}
                    <span className={passwordsMatch ? 'text-emerald-800 font-medium' : 'text-[#71717A]'}>
                      Las contraseñas coinciden
                    </span>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="specular-button w-full h-12 rounded-[15px] text-white text-[14.5px] font-medium tracking-tight flex items-center justify-center gap-2 active:scale-[0.985] transition-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Actualizando contraseña...</span>
                      </>
                    ) : (
                      <>
                        <span>Guardar y acceder</span>
                        <ArrowRight className="w-4 h-4 text-white/90" strokeWidth={2} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="pt-2 pb-1 text-center">
        <Link
          to="/login"
          className="text-[13px] text-[#71717A] hover:text-[#18181B] transition-colors"
        >
          Volver al inicio de sesión
        </Link>
      </footer>
    </div>
  )
}