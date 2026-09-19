import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Check, CheckCircle2, Eye, EyeOff, Loader2, Lock, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Nueva Contraseña
        </h1>
        <p className="text-sm text-slate-400 mt-1.5">
          Crea una nueva contraseña segura para tu cuenta
        </p>
      </div>

      <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
        {isSuccess ? (
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-white">
                Contraseña restablecida con éxito
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Tu contraseña ha sido actualizada y tu sesión está activa.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to="/"
                className="specular-button w-full py-3.5 rounded-2xl text-white font-medium text-sm inline-flex items-center justify-center gap-2"
              >
                Continuar a nuestro espacio
              </Link>
            </div>
          </div>
        ) : (
          <>
            {serverError && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium"
              >
                {serverError}
              </div>
            )}

            {!tokenRef.current && !search.token ? (
              <div className="text-center space-y-4 py-2">
                <p className="text-xs text-slate-400">
                  El enlace es inválido o no contiene un token de recuperación.
                </p>
                <Link
                  to="/forgot-password"
                  className="specular-button w-full py-3 rounded-2xl text-white font-medium text-xs inline-flex items-center justify-center"
                >
                  Solicitar nuevo enlace
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* New Password Field */}
                <div>
                  <label htmlFor="reset-new-password" className="sr-only">
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                      aria-hidden="true"
                    />
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
                      className={`glass-input w-full pl-10 pr-11 py-3 rounded-2xl text-sm text-white placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                        fieldErrors.newPassword ? 'border-rose-500/60 focus:border-rose-500' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      tabIndex={-1}
                      aria-label={showNewPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.newPassword && (
                    <p className="text-rose-400 text-xs mt-1.5 pl-1">
                      {fieldErrors.newPassword}
                    </p>
                  )}
                </div>

                {/* Confirm Password Field */}
                <div>
                  <label htmlFor="reset-confirm-password" className="sr-only">
                    Confirmar nueva contraseña
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                      aria-hidden="true"
                    />
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
                      className={`glass-input w-full pl-10 pr-11 py-3 rounded-2xl text-sm text-white placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                        fieldErrors.confirmPassword ? 'border-rose-500/60 focus:border-rose-500' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="text-rose-400 text-xs mt-1.5 pl-1">
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>

                {/* Password Criteria indicators */}
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
                    {hasLetter && hasNumber ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span
                      className={hasLetter && hasNumber ? 'text-emerald-300' : 'text-slate-400'}
                    >
                      Al menos una letra y un número
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {passwordsMatch ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span className={passwordsMatch ? 'text-emerald-300' : 'text-slate-400'}>
                      Las contraseñas coinciden
                    </span>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="specular-button w-full py-3.5 rounded-2xl text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Actualizando contraseña...</span>
                    </>
                  ) : (
                    <span>Guardar y acceder</span>
                  )}
                </button>
              </form>
            )}
          </>
        )}
      </div>

      <div className="text-center mt-6">
        <Link
          to="/login"
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  )
}