import { memo } from 'react'

interface AmbientRibbonsProps {
  pulseActive?: boolean
}

/**
 * Generative SVG backdrop with floating translucent color ribbons
 * inspired by romantic neon/rose and violet hues for LazUs.
 */
export const AmbientRibbons = memo(function AmbientRibbons({ pulseActive = false }: AmbientRibbonsProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {/* Dynamic backdrop base */}
      <div className="absolute inset-0 bg-[#080c14]" />

      {/* Top Rose-Amber Ribbon */}
      <div className="absolute -top-[15%] -right-[20%] w-[650px] h-[650px] rounded-full mix-blend-screen opacity-40 animate-ribbon-top">
        <svg viewBox="0 0 500 500" className="w-full h-full filter blur-[70px]">
          <defs>
            <linearGradient id="roseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#e11d48" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M 120,80 Q 300,10 400,160 T 320,380 Q 200,450 90,320 T 120,80 Z"
            fill="url(#roseGradient)"
          />
        </svg>
      </div>

      {/* Bottom Violet-Indigo Ribbon */}
      <div className="absolute -bottom-[20%] -left-[15%] w-[700px] h-[700px] rounded-full mix-blend-screen opacity-35 animate-ribbon-bottom">
        <svg viewBox="0 0 500 500" className="w-full h-full filter blur-[80px]">
          <defs>
            <linearGradient id="violetGradient" x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#6366f1" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M 150,120 Q 350,80 430,220 T 300,420 Q 150,440 80,290 T 150,120 Z"
            fill="url(#violetGradient)"
          />
        </svg>
      </div>

      {/* Center Heart-Glow Accent (Reacts with pulseActive) */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full mix-blend-screen pointer-events-none transition-opacity duration-1000 ${
          pulseActive ? 'opacity-80 animate-pulse-glow' : 'opacity-25 filter blur-[60px]'
        }`}
        style={{
          background: 'radial-gradient(circle, rgba(244,63,94,0.35) 0%, rgba(139,92,246,0.15) 50%, transparent 70%)',
        }}
      />

      {/* Micro-noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
    </div>
  )
})
