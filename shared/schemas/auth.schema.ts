import { z } from 'zod'

// Expresión regular para contraseña: mínimo 8 caracteres, máximo 128, al menos una letra y un número
export const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/

export const passwordValidation = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no puede exceder 128 caracteres')
  .regex(passwordRegex, 'La contraseña debe contener al menos una letra y un número')

// 1. Registro
export const RegisterInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('El correo electrónico no es válido')
      .max(255, 'El correo no puede exceder 255 caracteres'),
    displayName: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(120, 'El nombre no puede exceder 120 caracteres'),
    password: passwordValidation,
  })
  .strict()

export type RegisterInput = z.infer<typeof RegisterInputSchema>

// 2. Login
export const LoginInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('El correo electrónico no es válido')
      .max(255, 'El correo no puede exceder 255 caracteres'),
    password: z
      .string()
      .min(1, 'La contraseña es requerida')
      .max(128, 'La contraseña no puede exceder 128 caracteres'),
  })
  .strict()

export type LoginInput = z.infer<typeof LoginInputSchema>

// 3. Verificación de Email (Anti-Prefetching vía POST)
export const VerifyEmailInputSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, 'El token es requerido')
      .max(256, 'Token inválido'),
  })
  .strict()

export type VerifyEmailInput = z.infer<typeof VerifyEmailInputSchema>

// 4. Reenvío de Verificación
export const ResendVerificationInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('El correo electrónico no es válido')
      .max(255, 'El correo no puede exceder 255 caracteres'),
  })
  .strict()

export type ResendVerificationInput = z.infer<typeof ResendVerificationInputSchema>

// 5. Recuperación de Contraseña (Forgot Password)
export const ForgotPasswordInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('El correo electrónico no es válido')
      .max(255, 'El correo no puede exceder 255 caracteres'),
  })
  .strict()

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>

// 6. Reseteo de Contraseña (Reset Password)
export const ResetPasswordInputSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, 'El token es requerido')
      .max(256, 'Token inválido'),
    newPassword: passwordValidation,
  })
  .strict()

export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>

// 7. Asignación de Contraseña (Set Password - autenticado)
export const SetPasswordInputSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1)
      .max(128)
      .optional(),
    newPassword: passwordValidation,
  })
  .strict()

export type SetPasswordInput = z.infer<typeof SetPasswordInputSchema>

// 8. DTO de Usuario Autenticado (Zero-Leak: sin passwordHash)
export const AuthUserDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  emailVerified: z.boolean(),
  hasPassword: z.boolean(),
  createdAt: z.string().or(z.date()).optional(),
})

export type AuthUserDto = z.infer<typeof AuthUserDtoSchema>
