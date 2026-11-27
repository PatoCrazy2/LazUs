import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Clock, Eye, Heart, Lock, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ACTIVITY_CATEGORY_META } from '../../../../shared'
import { useCouple } from '../../couple/hooks/useCouple'
import { useTodayActivity } from '../hooks/useTodayActivity'
import { ActivityInputs } from './ActivityInputs'
import { CategoryBadge } from './CategoryBadge'
import { SubmissionPreview } from './SubmissionPreview'

export interface TodayActivityCardProps {
  autoReveal?: boolean
  onSendQuickAffection?: () => void
  isSendingAffection?: boolean
  waitingFooterSlot?: ReactNode
}

export function TodayActivityCard({
  autoReveal = false,
  onSendQuickAffection,
  isSendingAffection = false,
  waitingFooterSlot,
}: TodayActivityCardProps = {}) {
  const { partner } = useCouple()
  const { activity, isLoading, error, submitAnswer, isSubmitting, submitError } = useTodayActivity()
  const [hasTappedReveal, setHasTappedReveal] = useState(false)
  const isRevealedOpen = hasTappedReveal || autoReveal

  if (isLoading) {
    return (
      <div className="w-full rounded-2xl border border-[#EAEAEA] bg-white p-6 space-y-4 animate-pulse">
        <div className="h-5 w-28 bg-zinc-100 rounded-full" />
        <div className="h-6 w-3/4 bg-zinc-100 rounded-lg" />
        <div className="h-24 w-full bg-zinc-50 rounded-xl" />
      </div>
    )
  }

  if (error || !activity) {
    return (
      <div className="w-full rounded-2xl border border-[#EAEAEA] bg-white p-6 text-center space-y-2">
        <p className="text-sm font-medium text-[#18181B]">No pudimos cargar el reto de hoy</p>
        <p className="text-xs text-zinc-500">
          {error instanceof Error ? error.message : 'Verifica tu conexión e intenta nuevamente.'}
        </p>
      </div>
    )
  }

  const meta = ACTIVITY_CATEGORY_META[activity.category] ?? ACTIVITY_CATEGORY_META.getting_to_know
  const partnerName = partner?.display_name || 'tu pareja'

  const isStateA = !activity.my_submission && activity.status === 'pending'
  const isStateB = Boolean(activity.my_submission) && activity.status === 'pending'
  const isStateC = activity.status === 'revealed'

  // Cálculo simple de coincidencia para tipo prediction al revelar
  const predictionSummary = (() => {
    if (!isStateC || activity.response_type !== 'prediction') return null
    const mine = activity.my_submission?.payload
    const theirs = activity.partner_submission?.payload
    if (mine?.type !== 'prediction' || theirs?.type !== 'prediction') return null

    const norm = (s: string) => s.trim().toLowerCase()
    const iGuessedRight = norm(mine.guessed_partner_answer) === norm(theirs.my_answer)
    const partnerGuessedRight = norm(theirs.guessed_partner_answer) === norm(mine.my_answer)
    const score = (iGuessedRight ? 1 : 0) + (partnerGuessedRight ? 1 : 0)

    return { score, iGuessedRight, partnerGuessedRight }
  })()

  return (
    <section
      className="w-full rounded-2xl border border-[#EAEAEA] bg-white p-5 sm:p-6 shadow-xs text-left space-y-5 relative overflow-hidden"
      style={{ borderTopWidth: '3px', borderTopColor: meta.color }}
    >
      {/* Encabezado: Categoría + Fecha */}
      <div className="flex items-center justify-between gap-2">
        <CategoryBadge category={activity.category} occasion={activity.occasion} />
        <span className="text-[11px] font-medium text-zinc-400">{activity.logical_date}</span>
      </div>

      {/* Prompt del día */}
      <h2 className="text-lg sm:text-xl font-semibold text-[#18181B] leading-snug">
        {activity.prompt}
      </h2>

      {/* ESTADO A: Pendiente de responder */}
      {isStateA && (
        <div className="space-y-4">
          {activity.partner_completed && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50/70 border border-rose-100 text-xs text-rose-700">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>
                <strong>{partnerName}</strong> ya respondió. Responde tú para revelar ambas.
              </span>
            </div>
          )}

          <ActivityInputs
            responseType={activity.response_type}
            promptConfig={activity.prompt_config}
            isSubmitting={isSubmitting}
            onSubmit={async ({ content, payload, media }) => {
              await submitAnswer({
                activityId: activity.id,
                content,
                payload,
                media,
              })
            }}
          />

          {submitError && (
            <p className="text-xs text-rose-600">
              {submitError instanceof Error ? submitError.message : 'Error al enviar respuesta'}
            </p>
          )}
        </div>
      )}

      {/* ESTADO B: Respuesta sellada, esperando a la pareja */}
      {isStateB && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="rounded-xl border border-[#EAEAEA] bg-zinc-50/70 p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-white border border-[#EAEAEA] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-zinc-600" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-[#18181B]">Respuesta guardada ❤️</p>
              <p className="text-xs text-zinc-500">
                Estamos esperando a <strong>{partnerName}</strong>. Cuando ambos terminen, podrán
                descubrir sus respuestas.
              </p>
            </div>
          </div>

          <SubmissionPreview
            label="Tu respuesta sellada"
            submission={activity.my_submission}
            accentColor={meta.color}
          />

          {onSendQuickAffection && (
            <button
              type="button"
              onClick={onSendQuickAffection}
              disabled={isSendingAffection}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-50/80 hover:bg-rose-100/80 border border-rose-200/80 text-xs font-medium text-rose-700 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
            >
              <Heart className="w-3.5 h-3.5 text-[#FF5C7A] fill-[#FF5C7A]" />
              <span>Enviar toque de afecto a {partnerName}</span>
            </button>
          )}

          {waitingFooterSlot}
        </motion.div>
      )}

      {/* ESTADO C: Ambos respondieron -> Botón "Tocar para revelar" o Vista Revelada */}
      {isStateC && (
        <AnimatePresence mode="wait">
          {!isRevealedOpen ? (
            <motion.div
              key="reveal-gate"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="rounded-xl border border-[#EAEAEA] bg-zinc-50/60 p-6 text-center space-y-4"
            >
              <div
                className="w-12 h-12 rounded-full mx-auto flex items-center justify-center border"
                style={{
                  color: meta.color,
                  borderColor: `${meta.color}33`,
                  backgroundColor: `${meta.color}12`,
                }}
              >
                <Lock className="w-5 h-5" />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#18181B]">
                  ¡Ambos completaron el reto de hoy!
                </p>
                <p className="text-xs text-zinc-500">
                  Sus respuestas están listas para descubrirse juntas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHasTappedReveal(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#18181B] text-white text-sm font-medium hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>Tocar para revelar</span>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="revealed-content"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="space-y-3"
            >
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                <span>Respuestas reveladas</span>
              </div>

              {predictionSummary && (
                <div className="rounded-xl border border-purple-100 bg-purple-50/60 px-3.5 py-2.5 text-xs text-purple-800">
                  Puntaje de sincronía: <strong>{predictionSummary.score} / 2</strong> aciertos
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                <SubmissionPreview
                  label="Tú"
                  submission={activity.my_submission}
                  accentColor={meta.color}
                />
                <SubmissionPreview
                  label={partnerName}
                  submission={activity.partner_submission}
                  accentColor={meta.color}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </section>
  )
}
