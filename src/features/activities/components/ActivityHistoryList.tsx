import { BookHeart } from 'lucide-react'
import { ACTIVITY_CATEGORY_META } from '../../../../shared'
import { useCouple } from '../../couple/hooks/useCouple'
import { useActivityHistory } from '../hooks/useActivityHistory'
import { CategoryBadge } from './CategoryBadge'
import { SubmissionPreview } from './SubmissionPreview'

export function ActivityHistoryList() {
  const { partner } = useCouple()
  const { items, isLoading } = useActivityHistory()
  const partnerName = partner?.display_name || 'Tu pareja'

  return (
    <section className="w-full space-y-3 text-left">
      <div className="flex items-center gap-2 px-1">
        <BookHeart className="w-4 h-4 text-zinc-500" />
        <h3 className="text-sm font-semibold text-[#18181B]">Recuerdos revelados</h3>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 text-xs text-zinc-400">
          Cargando historial...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 text-center space-y-1">
          <p className="text-xs font-medium text-zinc-600">Aún no hay recuerdos revelados</p>
          <p className="text-[11px] text-zinc-400">
            Cuando ambos completen su primer reto diario, aparecerá guardado aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const meta =
              ACTIVITY_CATEGORY_META[item.category] ?? ACTIVITY_CATEGORY_META.getting_to_know
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[#EAEAEA] bg-white p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <CategoryBadge category={item.category} occasion={item.occasion} />
                  <span className="text-[11px] text-zinc-400">{item.logical_date}</span>
                </div>

                <p className="text-sm font-medium text-[#18181B]">{item.prompt}</p>

                <div className="grid grid-cols-1 gap-2.5">
                  <SubmissionPreview
                    label="Tú"
                    submission={item.my_submission}
                    accentColor={meta.color}
                  />
                  <SubmissionPreview
                    label={partnerName}
                    submission={item.partner_submission}
                    accentColor={meta.color}
                  />
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
