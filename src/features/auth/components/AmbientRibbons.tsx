import React from 'react'

interface AmbientRibbonsProps {
  pulseActive?: boolean
}

export const AmbientRibbons: React.FC<AmbientRibbonsProps> = ({ pulseActive = false }) => {
  return (
    <div
      className={`absolute inset-0 pointer-events-none z-0 overflow-hidden transition-all duration-700 ${
        pulseActive ? 'scale-[1.03]' : 'scale-100'
      }`}
    >
      {/* Resplandores difusos */}
      <div
        className={`mesh-glow absolute -top-16 -right-16 w-80 h-80 rounded-full bg-gradient-to-br from-[#FF4D8D]/15 via-[#8B5CF6]/10 to-transparent blur-3xl transition-opacity duration-500 ${
          pulseActive ? 'opacity-90 scale-110' : 'opacity-70'
        }`}
      />
      <div
        className={`mesh-glow absolute top-1/3 -left-28 w-80 h-80 rounded-full bg-gradient-to-tr from-[#FF5C7A]/12 via-[#FF4D8D]/08 to-transparent blur-3xl transition-opacity duration-500 ${
          pulseActive ? 'opacity-90 scale-110' : 'opacity-70'
        }`}
      />

      {/* Cintas fluidas vectoriales */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="threadGradA" x1="20" y1="90" x2="370" y2="460" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF5C7A" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#FF4D8D" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.6" />
          </linearGradient>

          <linearGradient id="threadGradB" x1="380" y1="200" x2="10" y2="650" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.75" />
            <stop offset="48%" stopColor="#FF4D8D" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#FF5C7A" stopOpacity="0.8" />
          </linearGradient>

          <filter id="ribbonSoftBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={pulseActive ? "20" : "16"} result="blur" />
          </filter>
        </defs>

        {/* Capa superior de onda */}
        <g className={`ambient-flow-top transition-opacity duration-500 ${pulseActive ? 'opacity-85' : 'opacity-60'}`}>
          <path
            d="M-40,110 C80,70 140,240 215,220 C290,200 340,90 430,140 C430,175 350,260 260,265 C170,270 120,160 -40,170 Z"
            fill="url(#threadGradA)"
            filter="url(#ribbonSoftBlur)"
          />
          <path
            d="M-30,135 C90,95 150,230 220,225 C295,215 350,120 420,150"
            fill="none"
            stroke="url(#threadGradA)"
            strokeOpacity="0.45"
            strokeWidth="1.5"
          />
        </g>

        {/* Capa inferior de onda */}
        <g className={`ambient-flow-bottom transition-opacity duration-500 ${pulseActive ? 'opacity-80' : 'opacity-55'}`}>
          <path
            d="M-50,420 C60,400 130,580 200,530 C270,480 320,340 430,380 C440,430 330,570 230,580 C130,590 70,470 -50,490 Z"
            fill="url(#threadGradB)"
            filter="url(#ribbonSoftBlur)"
          />
          <path
            d="M-40,450 C70,420 145,565 210,545 C280,510 325,385 420,410"
            fill="none"
            stroke="url(#threadGradB)"
            strokeOpacity="0.4"
            strokeWidth="1.75"
          />
        </g>

        {/* Línea de conexión punteada (oculta en mobile) */}
        <path
          className="hidden md:inline"
          d="M165,260 C185,340 205,370 225,490"
          stroke="url(#threadGradA)"
          strokeDasharray="3 4"
          strokeOpacity={pulseActive ? "0.6" : "0.25"}
          strokeWidth="0.75"
        />
      </svg>
    </div>
  )
}
