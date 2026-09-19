import { useCallback, useEffect, useState } from 'react'

/**
 * Hook to manage countdown timers from HTTP 429 (Too Many Requests) Retry-After headers.
 * Provides active status, remaining seconds, human-readable formatting, and start/clear handlers.
 */
export function useRetryAfterCountdown() {
  const [secondsLeft, setSecondsLeft] = useState<number>(0)

  useEffect(() => {
    if (secondsLeft <= 0) return

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [secondsLeft])

  const startCountdown = useCallback((seconds: number) => {
    if (seconds > 0) {
      setSecondsLeft(Math.ceil(seconds))
    }
  }, [])

  const clearCountdown = useCallback(() => {
    setSecondsLeft(0)
  }, [])

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const formattedTime = mins > 0 ? `${mins}m ${secs < 10 ? '0' : ''}${secs}s` : `${secs}s`

  return {
    secondsLeft,
    isRateLimited: secondsLeft > 0,
    formattedTime,
    startCountdown,
    clearCountdown,
  }
}