import React, { memo, useEffect, useState } from 'react'

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

interface IosStatusBarProps {
  customTime?: string
}

/**
 * Simulated iOS Status Bar (Stitch design).
 * Visible in browser/preview mode; hidden in standalone PWA to let the native system bar take precedence.
 */
export const IosStatusBar: React.FC<IosStatusBarProps> = memo(function IosStatusBar({ customTime = '9:41' }) {
  const isStandalone = useIsStandalone()

  if (isStandalone) {
    return <div className="w-full pt-safe pointer-events-none" aria-hidden="true" />
  }

  return (
    <header className="relative z-20 pt-3 px-7 flex justify-between items-center text-xs font-semibold text-[#18181B] select-none">
      <span className="tracking-tight text-[15px] font-medium pl-0.5">{customTime}</span>
      <div aria-label="System status" className="flex items-center gap-2 pr-0.5">
        <svg className="w-4 h-3.5 fill-current text-[#18181B]" viewBox="0 0 17 12">
          <rect height="3.5" rx="0.7" width="2.5" x="0" y="8.5" />
          <rect height="6" rx="0.7" width="2.5" x="4.5" y="6" />
          <rect height="8.5" rx="0.7" width="2.5" x="9" y="3.5" />
          <rect height="11.5" rx="0.7" width="2.5" x="13.5" y="0.5" />
        </svg>
        <svg className="w-4 h-3 fill-current text-[#18181B]" viewBox="0 0 16 12">
          <path d="M8 2.8C10.5 2.8 12.8 3.8 14.5 5.4L16 3.8C13.9 1.8 11.1 0.6 8 0.6C4.9 0.6 2.1 1.8 0 3.8L1.5 5.4C3.2 3.8 5.5 2.8 8 2.8ZM8 6.4C9.6 6.4 11 7.1 12.1 8.2L13.6 6.6C12.1 5.2 10.2 4.3 8 4.3C5.8 4.3 3.9 5.2 2.4 6.6L3.9 8.2C5 7.1 6.4 6.4 8 6.4ZM8 9.9C8.8 9.9 9.5 10.6 9.5 11.4C9.5 12.2 8.8 12.9 8 12.9C7.2 12.9 6.5 12.2 6.5 11.4C6.5 10.6 7.2 9.9 8 9.9Z" />
        </svg>
        <div className="w-5 h-2.5 border border-[#18181B] rounded-[3.5px] p-0.5 flex items-center relative">
          <div className="h-full w-3.5 bg-[#18181B] rounded-[1.5px]" />
          <div className="w-0.5 h-1 bg-[#18181B] absolute -right-1 rounded-r-[1px]" />
        </div>
      </div>
    </header>
  )
})

/**
 * Simulated iOS Home Indicator pill bar (Stitch design).
 */
export const IosHomeIndicator: React.FC = memo(function IosHomeIndicator() {
  return (
    <div className="relative z-20 pb-2 pt-1 flex justify-center w-full select-none pointer-events-none">
      <div className="w-36 h-1 bg-[#18181B]/20 rounded-full" />
    </div>
  )
})

export const IosChrome = {
  StatusBar: IosStatusBar,
  HomeIndicator: IosHomeIndicator,
}

