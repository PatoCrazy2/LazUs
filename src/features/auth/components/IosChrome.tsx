import { memo, useEffect, useState } from 'react'
import { Battery, Wifi } from 'lucide-react'

/**
 * Hook to detect whether the web app is running in Standalone PWA mode.
 * Evaluates both iOS-specific navigator.standalone and W3C matchMedia display-mode.
 */
export function useIsStandalone(): boolean {
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    )
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(display-mode: standalone)')
    const onChange = (e: MediaQueryListEvent) => {
      setIsStandalone(
        e.matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true
      )
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isStandalone
}

/**
 * Simulated iOS Status Bar.
 * Visible only in browser view; gracefully hidden when installed as a standalone PWA
 * to let the native system status bar take precedence while respecting safe-area-inset.
 */
export const IosStatusBar = memo(function IosStatusBar() {
  const isStandalone = useIsStandalone()

  if (isStandalone) {
    // In standalone PWA, the OS status bar is present; provide safe-area spacer only
    return <div className="w-full pt-safe pointer-events-none" aria-hidden="true" />
  }

  return (
    <header
      role="presentation"
      className="w-full pt-safe px-6 py-2 flex items-center justify-between text-xs font-semibold tracking-tight text-slate-300 select-none z-30"
    >
      <span className="font-mono text-[13px] text-white/90">9:41</span>
      <div className="flex items-center gap-2 text-white/80">
        <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="text-[11px] font-medium tracking-wide">5G</span>
        <Battery className="w-4 h-4" aria-hidden="true" />
      </div>
    </header>
  )
})

/**
 * Simulated iOS Home Indicator pill bar at the bottom.
 * Rendered with safe-area spacing to avoid layout overlap on iPhone devices.
 */
export const IosHomeIndicator = memo(function IosHomeIndicator() {
  return (
    <div
      aria-hidden="true"
      className="w-full pb-safe flex justify-center items-center py-2 pointer-events-none z-30 select-none"
    >
      <div className="w-32 h-1 bg-white/20 rounded-full" />
    </div>
  )
})

export const IosChrome = {
  StatusBar: IosStatusBar,
  HomeIndicator: IosHomeIndicator,
}
