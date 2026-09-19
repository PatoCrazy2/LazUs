import { memo, useState } from 'react'

interface GoogleAuthButtonProps {
  label?: string
  disabled?: boolean
  className?: string
}

/**
 * Official Google OAuth button.
 * Dispatches a native full-page browser navigation to /api/auth/google
 * allowing Cloudflare Workers to handle PKCE, HMAC state signing, and 302 redirects natively.
 */
export const GoogleAuthButton = memo(function GoogleAuthButton({
  label = 'Continuar con Google',
  disabled = false,
  className = '',
}: GoogleAuthButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false)

  const handleGoogleSignIn = () => {
    if (disabled || isRedirecting) return
    setIsRedirecting(true)
    // Direct native browser redirection: lets Edge Worker handle OAuth 302 directly
    window.location.href = '/api/auth/google'
  }

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={disabled || isRedirecting}
      aria-label={label}
      className={`w-full relative flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl font-medium text-sm text-slate-200 bg-slate-900/80 hover:bg-slate-850 border border-slate-700/60 hover:border-slate-600 transition-all duration-200 active:scale-[0.985] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${className}`}
    >
      <svg
        className="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="#4285F4"
          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.98 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
        />
      </svg>
      <span>{isRedirecting ? 'Conectando con Google...' : label}</span>
    </button>
  )
})
