import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  QrCode,
  Sparkles,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useCouple } from '../hooks/useCouple'

interface PairingSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * PairingSettingsModal: Centro de Emparejamiento y Códigos Digitales de Respaldo (`LZ-XXXX`).
 * Ubicado en los ajustes / menú secundario para no opacar el flujo NFC físico principal.
 * Permite:
 * 1. Generar un código temporal de 24h (`LZ-XXXXXX`) con botón de copiar / compartir.
 * 2. Canjear manualmente un código proporcionado por la pareja para redirigir a `/link/:code`.
 */
export function PairingSettingsModal({ isOpen, onClose }: PairingSettingsModalProps) {
  const navigate = useNavigate()
  const { createInviteCode, isCreatingInviteCode } = useCouple()

  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [inputCode, setInputCode] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleGenerateCode = async () => {
    try {
      const data = await createInviteCode()
      setGeneratedCode(data.invitation_code)
    } catch {
      // Ignorar o mostrar feedback
    }
  }

  const handleCopy = async () => {
    if (!generatedCode) return
    const shareText = `¡Únete a mi espacio íntimo en LazUs! Usa este código de invitación: ${generatedCode} o entra en: ${window.location.origin}/link/${generatedCode}`
    await navigator.clipboard.writeText(shareText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRedeemCode = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = inputCode.trim().toUpperCase()
    if (!cleanCode) return

    // Validar formato LZ-XXXX
    if (!cleanCode.startsWith('LZ-') || cleanCode.length < 5) {
      setInputError('El código debe comenzar con LZ- (ej. LZ-AB12)')
      return
    }

    setInputError(null)
    onClose()
    // Redirigir a la ruta unificada de resolución
    void navigate({
      to: '/link/$identifier',
      params: { identifier: cleanCode },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-[390px] bg-white rounded-[24px] border border-[#EAEAEA] p-6 shadow-2xl text-[#18181B] space-y-6 relative select-none">
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-[#EAEAEA]/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-pink-50 text-[#FF5C7A]">
              <KeyRound className="w-4 h-4" />
            </div>
            <h2 className="text-[17px] font-bold tracking-tight">Vincular Pareja</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-100 text-[#71717A] hover:text-[#18181B] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sección 1: Generar Código de Respaldo */}
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
              Compartir invitación digital
            </h3>
            <p className="text-[13px] text-[#71717A] leading-relaxed">
              Ideal si tu pareja está lejos o aún no cuenta con la pulsera física.
            </p>
          </div>

          {generatedCode ? (
            <div className="p-4 rounded-[16px] bg-pink-50/50 border border-pink-100 text-center space-y-3">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[#FF5C7A] uppercase tracking-wider">
                  Código de invitación
                </span>
                <p className="text-2xl font-mono font-bold tracking-wider text-[#18181B]">
                  {generatedCode}
                </p>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#71717A]">
                <Clock className="w-3.5 h-3.5 text-pink-400" />
                <span>Válido por 24 horas</span>
              </div>

              <button
                type="button"
                onClick={() => void handleCopy()}
                className="w-full py-2.5 px-3 rounded-[12px] bg-white border border-pink-200 text-[#18181B] text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition-all cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-semibold">¡Copiado al portapapeles!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#FF5C7A]" />
                    <span>Copiar invitación y enlace</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleGenerateCode()}
              disabled={isCreatingInviteCode}
              className="w-full py-3 px-4 rounded-[14px] bg-zinc-50 border border-zinc-200/80 text-xs font-medium text-[#18181B] flex items-center justify-center gap-2 hover:bg-zinc-100 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
            >
              {isCreatingInviteCode ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#71717A]" />
                  <span>Generando código único...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-[#FF5C7A]" />
                  <span>Generar código de invitación digital</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Separador */}
        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-[#EAEAEA]" />
          <span className="absolute bg-white px-2.5 text-[11px] text-[#A1A1AA] uppercase tracking-wider font-mono">
            o
          </span>
        </div>

        {/* Sección 2: Canjear Código de la Pareja */}
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
              ¿Tu pareja te compartió un código?
            </h3>
            <p className="text-[13px] text-[#71717A] leading-relaxed">
              Introduce el código de 6 caracteres para iniciar el ritual de unión.
            </p>
          </div>

          <form onSubmit={handleRedeemCode} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="LZ-XXXXXX"
                value={inputCode}
                onChange={(e) => {
                  setInputCode(e.target.value.toUpperCase())
                  if (inputError) setInputError(null)
                }}
                maxLength={10}
                className="flex-1 h-11 px-3.5 rounded-[12px] bg-zinc-50 border border-zinc-200 text-sm font-mono tracking-wider text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#18181B] transition-colors uppercase"
              />
              <button
                type="submit"
                disabled={!inputCode.trim()}
                className="h-11 px-4 rounded-[12px] bg-[#18181B] text-white text-xs font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>Unirme</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {inputError && (
              <p className="text-rose-600 text-xs pl-1 font-medium">{inputError}</p>
            )}
          </form>
        </div>

        {/* Footer info NFC */}
        <div className="pt-2 text-center">
          <p className="text-[11.5px] text-[#A1A1AA] flex items-center justify-center gap-1">
            <QrCode className="w-3.5 h-3.5" />
            <span>También puedes vincularte tocando las pulseras NFC.</span>
          </p>
        </div>
      </div>
    </div>
  )
}
