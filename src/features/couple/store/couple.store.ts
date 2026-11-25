import { db, type LocalCouple } from '../../../db'

/**
 * Gestor del almacén offline de la pareja en Dexie (IndexedDB).
 * Permite a la PWA consultar el estado de la pareja de forma inmediata sin conexión.
 */
export const coupleStore = {
  /**
   * Guarda o actualiza los datos de la pareja localmente.
   */
  async saveCouple(couple: LocalCouple): Promise<void> {
    await db.couple.put(couple)
  },

  /**
   * Obtiene la pareja actualmente guardada en Dexie.
   */
  async getCouple(): Promise<LocalCouple | undefined> {
    return await db.couple.toCollection().first()
  },

  /**
   * Limpia los datos de la pareja local (ej. al disolver o cerrar sesión).
   */
  async clearCouple(): Promise<void> {
    await db.couple.clear()
  },
}
