import type { AuthUserDto } from '../../../../shared'
import { db, type LocalProfile } from '../../../db'

/**
 * Gestor del almacén offline de autenticación en Dexie (IndexedDB).
 * Permite a la PWA arrancar al instante mostrando el perfil del usuario incluso offline.
 */
export const authStore = {
  /**
   * Guarda o actualiza el perfil del usuario autenticado en la base de datos local Dexie.
   */
  async saveProfile(user: AuthUserDto, coupleId?: string): Promise<void> {
    const existing = await db.profile.get(user.id)
    const profileData: LocalProfile = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl || undefined,
      coupleId: coupleId || existing?.coupleId,
      emailVerified: user.emailVerified,
      hasPassword: user.hasPassword,
    }

    await db.profile.put(profileData)
  },

  /**
   * Obtiene el perfil actualmente almacenado en Dexie.
   */
  async getProfile(): Promise<LocalProfile | undefined> {
    return await db.profile.toCollection().first()
  },

  /**
   * Elimina el perfil local al cerrar sesión.
   */
  async clearProfile(): Promise<void> {
    await db.profile.clear()
  },
}
