import { PlusSquare, Share, Smartphone } from 'lucide-react'

export interface IosStandaloneInstallGuideProps {
  compact?: boolean
}

/**
 * Guía visual de 2 pasos obligatoria en iOS Safari cuando el usuario aún no ha instalado
 * LazUs en su pantalla de inicio (`!standalone`), evitando invocar `Notification.requestPermission()`.
 */
export function IosStandaloneInstallGuide({ compact = false }: IosStandaloneInstallGuideProps) {
  return (
    <div
      className={`rounded-xl border border-pink-100 bg-pink-50/50 text-left ${
        compact ? 'p-3.5 space-y-2.5' : 'p-4 space-y-3'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-white border border-pink-100 flex items-center justify-center shrink-0 text-[#FF5C7A]">
          <Smartphone className="w-3.5 h-3.5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-[#18181B]">
            Instala LazUs en tu iPhone para recibir avisos
          </p>
          <p className="text-[11.5px] text-zinc-600 leading-relaxed">
            En iOS, Apple requiere abrir LazUs desde tu pantalla de inicio para activar las
            notificaciones privadas.
          </p>
        </div>
      </div>

      <ol className="space-y-2 text-[11.5px] text-[#18181B]">
        <li className="flex items-center gap-2 bg-white/90 rounded-lg px-3 py-2 border border-pink-100/80">
          <span className="w-4 h-4 rounded-full bg-[#18181B] text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
            1
          </span>
          <Share className="w-3.5 h-3.5 text-[#FF5C7A] shrink-0" />
          <span>
            Toca el ícono <strong>Compartir</strong> en la barra de Safari.
          </span>
        </li>
        <li className="flex items-center gap-2 bg-white/90 rounded-lg px-3 py-2 border border-pink-100/80">
          <span className="w-4 h-4 rounded-full bg-[#18181B] text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
            2
          </span>
          <PlusSquare className="w-3.5 h-3.5 text-[#FF5C7A] shrink-0" />
          <span>
            Elige <strong>&ldquo;Agregar a inicio&rdquo;</strong> y ábrela desde ahí.
          </span>
        </li>
      </ol>
    </div>
  )
}
