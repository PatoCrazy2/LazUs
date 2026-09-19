import React, { memo } from 'react'

/**
 * Native Safe-Area Spacer for top notch / Dynamic Island / system status bar.
 * Does not render any fake/simulated OS status bar (no 9:41, fake battery or wifi).
 * Respects CSS env(safe-area-inset-top) natively.
 */
export const IosStatusBar: React.FC = memo(function IosStatusBar() {
  return <div className="w-full pt-safe pointer-events-none select-none" aria-hidden="true" />
})

/**
 * Native Safe-Area Spacer for bottom home indicator.
 * Respects CSS env(safe-area-inset-bottom) natively.
 */
export const IosHomeIndicator: React.FC = memo(function IosHomeIndicator() {
  return <div className="w-full pb-safe pointer-events-none select-none" aria-hidden="true" />
})

export const IosChrome = {
  StatusBar: IosStatusBar,
  HomeIndicator: IosHomeIndicator,
}

// Retained for export contract compatibility
export function useIsStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}


