import { Resend } from 'resend'

export interface EmailServiceConfig {
  resendApiKey?: string
  fromEmail?: string
  appBaseUrl?: string
}

export interface SendVerificationEmailParams {
  email: string
  displayName: string
  token: string
}

export interface SendPasswordResetEmailParams {
  email: string
  displayName: string
  token: string
}

export class EmailService {
  private resend: Resend | null = null
  private fromEmail: string
  private appBaseUrl: string

  constructor(config: EmailServiceConfig) {
    if (config.resendApiKey) {
      this.resend = new Resend(config.resendApiKey)
    }
    this.fromEmail = config.fromEmail || 'LazUs <onboarding@resend.dev>'
    this.appBaseUrl = (config.appBaseUrl || 'http://localhost:5173').replace(/\/$/, '')
  }

  /**
   * Envía correo de verificación de email (anti-prefetching vía POST).
   * Invariante canónica (§2.8): Envío resiliente y no bloqueante.
   */
  async sendVerificationEmail(params: SendVerificationEmailParams): Promise<boolean> {
    const verificationUrl = `${this.appBaseUrl}/verify-email?token=${encodeURIComponent(params.token)}`

    // Log en consola para entornos de desarrollo / pruebas locales
    console.info(`[EmailService] Enlace de verificación para ${params.email}: ${verificationUrl}`)

    if (!this.resend) {
      console.warn('[EmailService] RESEND_API_KEY no configurada. Omitiendo envío SMTP.')
      return false
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: params.email,
        subject: 'Verifica tu correo en LazUs',
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">¡Hola, ${params.displayName}!</h2>
            <p>Gracias por unirte a LazUs. Para activar tu cuenta, confirma tu correo haciendo clic en el siguiente enlace:</p>
            <div style="margin: 25px 0;">
              <a href="${verificationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Confirmar mi correo
              </a>
            </div>
            <p style="color: #6b7280; font-size: 13px;">Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
          </div>
        `,
      })

      if (error) {
        console.error('[EmailService] Error devuelto por Resend al enviar verificación:', error)
        return false
      }

      return true
    } catch (err) {
      console.error('[EmailService] Excepción al contactar con el servicio de correo (Resend):', err)
      return false
    }
  }

  /**
   * Envía correo de recuperación de contraseña.
   * Invariante canónica (§2.8): Envío resiliente y no bloqueante.
   */
  async sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<boolean> {
    const resetUrl = `${this.appBaseUrl}/reset-password?token=${encodeURIComponent(params.token)}`

    console.info(`[EmailService] Enlace de recuperación para ${params.email}: ${resetUrl}`)

    if (!this.resend) {
      console.warn('[EmailService] RESEND_API_KEY no configurada. Omitiendo envío SMTP.')
      return false
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: params.email,
        subject: 'Restablece tu contraseña en LazUs',
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">Restablecimiento de contraseña</h2>
            <p>Hola, ${params.displayName}. Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en LazUs.</p>
            <div style="margin: 25px 0;">
              <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Restablecer contraseña
              </a>
            </div>
            <p style="color: #6b7280; font-size: 13px;">Este enlace expirará en 1 hora. Si no solicitaste este cambio, puedes ignorar este mensaje de forma segura.</p>
          </div>
        `,
      })

      if (error) {
        console.error('[EmailService] Error devuelto por Resend al enviar reseteo:', error)
        return false
      }

      return true
    } catch (err) {
      console.error('[EmailService] Excepción al contactar con el servicio de correo (Resend):', err)
      return false
    }
  }
}
