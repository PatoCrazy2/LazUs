import {
  Clock,
  Compass,
  Dices,
  Flame,
  Footprints,
  Heart,
  HeartHandshake,
  Music,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { ACTIVITY_CATEGORY_META, type ActivityCategory } from '../../../../shared'

const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  Clock,
  Compass,
  HeartHandshake,
  Flame,
  Music,
  Heart,
  Dices,
  Footprints,
  Sun,
}

interface CategoryBadgeProps {
  category: ActivityCategory
  occasion?: 'daily' | 'special_date' | 'long_distance'
}

export function CategoryBadge({ category, occasion }: CategoryBadgeProps) {
  const meta = ACTIVITY_CATEGORY_META[category] ?? ACTIVITY_CATEGORY_META.getting_to_know
  const Icon = ICON_MAP[meta.icon] ?? Sparkles

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
        style={{
          color: meta.color,
          borderColor: `${meta.color}33`,
          backgroundColor: `${meta.color}0D`,
        }}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{meta.label}</span>
      </span>

      {occasion === 'special_date' && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-pink-50 text-pink-600 border border-pink-200">
          Fecha especial
        </span>
      )}
    </div>
  )
}
