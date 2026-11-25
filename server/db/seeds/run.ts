import 'dotenv/config'
import { getDb } from '../index'
import { seedActivityPrompts } from './prompts'

async function main() {
  const db = getDb()
  await seedActivityPrompts(db)
  console.log('[Seed] Catálogo de actividades cargado correctamente.')
  process.exit(0)
}

main().catch((err) => {
  console.error('[Seed] Error al cargar catálogo:', err)
  process.exit(1)
})
