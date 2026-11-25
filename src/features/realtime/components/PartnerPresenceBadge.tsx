interface PartnerPresenceBadgeProps {
  isOnline: boolean
}

export function PartnerPresenceBadge({ isOnline }: PartnerPresenceBadgeProps) {
  if (!isOnline) {
    return null
  }

  return (
    <span
      className="inline-flex items-center gap-1 ml-1 pl-1.5 border-l border-[#EAEAEA] text-[11px] font-medium text-emerald-700"
      aria-label="Tu pareja está en línea"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span>En línea</span>
    </span>
  )
}
