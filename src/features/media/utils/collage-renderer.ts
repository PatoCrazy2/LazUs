import type { WeeklyCollageItem } from '../../../../shared'
import { mediaApi } from '../api/media.api'

export type CollageTheme = 'light' | 'night'

export const COLLAGE_WIDTH = 1080
export const COLLAGE_HEIGHT = 1920

export function formatWeekRangeLabel(weekStartDate: string, weekEndDate: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return iso
    const dt = new Date(Date.UTC(y, m - 1, d))
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(dt)
  }
  return `${fmt(weekStartDate)} – ${fmt(weekEndDate)}`
}

async function loadImageFromSignedMediaKey(mediaKey: string): Promise<HTMLImageElement | null> {
  try {
    const { view_url } = await mediaApi.requestViewUrl(mediaKey)
    const isSameOrigin =
      typeof window !== 'undefined' && view_url.startsWith(window.location.origin)
    const res = await fetch(view_url, {
      credentials: isSameOrigin ? 'include' : 'omit',
    })
    if (!res.ok) return null
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)

    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(null)
      }
      img.src = objectUrl
    })
  } catch {
    return null
  }
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  const imgRatio = img.width / img.height
  const boxRatio = w / h

  let sx = 0
  let sy = 0
  let sw = img.width
  let sh = img.height

  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / boxRatio
    sy = (img.height - sh) / 2
  }

  ctx.save()
  drawRoundedRectPath(ctx, x, y, w, h, radius)
  ctx.clip()
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const words = text.trim().split(/\s+/)
  let line = ''
  let currentY = y
  let lineCount = 0

  for (let i = 0; i < words.length; i++) {
    const candidate = line ? `${line} ${words[i]}` : words[i]!
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lineCount++
      if (lineCount >= maxLines) {
        let truncated = line
        while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
          truncated = truncated.slice(0, -1)
        }
        ctx.fillText(`${truncated}…`, x, currentY)
        return currentY + lineHeight
      }
      ctx.fillText(line, x, currentY)
      currentY += lineHeight
      line = words[i]!
    } else {
      line = candidate
    }
  }

  if (line) {
    ctx.fillText(line, x, currentY)
    currentY += lineHeight
  }
  return currentY
}

/**
 * Renderiza el Collage Semanal 9:16 (1080×1920 PNG) en HTML5 Canvas 2D
 * estilo editorial Yope/Polaroid manteniendo $0 de cómputo en Workers.
 */
export async function renderWeeklyCollageCanvas(
  collage: WeeklyCollageItem,
  options: {
    myName?: string
    partnerName?: string
    theme?: CollageTheme
  } = {}
): Promise<Blob> {
  const theme = options.theme ?? 'light'
  const isNight = theme === 'night'

  const canvas = document.createElement('canvas')
  canvas.width = COLLAGE_WIDTH
  canvas.height = COLLAGE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('No se pudo inicializar Canvas 2D para generar el collage')
  }

  // 1. Fondo + halo ambiental LazUs (#FF5C7A + #8B5CF6)
  ctx.fillStyle = isNight ? '#111115' : '#FFFFFF'
  ctx.fillRect(0, 0, COLLAGE_WIDTH, COLLAGE_HEIGHT)

  const roseGlow = ctx.createRadialGradient(180, 220, 40, 180, 220, 620)
  roseGlow.addColorStop(0, isNight ? 'rgba(255, 92, 122, 0.24)' : 'rgba(255, 92, 122, 0.14)')
  roseGlow.addColorStop(1, 'rgba(255, 92, 122, 0)')
  ctx.fillStyle = roseGlow
  ctx.fillRect(0, 0, COLLAGE_WIDTH, COLLAGE_HEIGHT)

  const violetGlow = ctx.createRadialGradient(920, 1650, 40, 920, 1650, 680)
  violetGlow.addColorStop(0, isNight ? 'rgba(139, 92, 246, 0.24)' : 'rgba(139, 92, 246, 0.14)')
  violetGlow.addColorStop(1, 'rgba(139, 92, 246, 0)')
  ctx.fillStyle = violetGlow
  ctx.fillRect(0, 0, COLLAGE_WIDTH, COLLAGE_HEIGHT)

  const primaryText = isNight ? '#FAFAFA' : '#18181B'
  const mutedText = isNight ? '#A1A1AA' : '#71717A'
  const cardBg = isNight ? '#1B1B22' : '#FAFAFA'
  const cardBorder = isNight ? 'rgba(255,255,255,0.10)' : '#EAEAEA'

  // 2. Cabecera editorial
  const padX = 76
  ctx.fillStyle = '#FF5C7A'
  ctx.font = '600 26px system-ui, -apple-system, sans-serif'
  ctx.fillText('LAZUS · NUESTROS MOMENTOS', padX, 126)

  const coupleTitle =
    options.myName && options.partnerName
      ? `${options.myName} & ${options.partnerName}`
      : 'Nuestra Semana'
  ctx.fillStyle = primaryText
  ctx.font = '700 62px system-ui, -apple-system, sans-serif'
  ctx.fillText(coupleTitle, padX, 204)

  const rangeLabel = formatWeekRangeLabel(collage.week_start_date, collage.week_end_date)
  ctx.fillStyle = mutedText
  ctx.font = '500 30px system-ui, -apple-system, sans-serif'
  ctx.fillText(
    `${rangeLabel}  ·  ${collage.activities_count} ${
      collage.activities_count === 1 ? 'recuerdo revelado' : 'recuerdos revelados'
    }`,
    padX,
    256
  )

  // 3. Recolectar hasta 4 claves de fotos de la semana
  const photoKeys: string[] = []
  for (const h of collage.highlights) {
    if (h.my_media_key && h.my_media_key.includes('/photo/')) photoKeys.push(h.my_media_key)
    if (h.partner_media_key && h.partner_media_key.includes('/photo/')) {
      photoKeys.push(h.partner_media_key)
    }
    if (photoKeys.length >= 4) break
  }

  const loadedPhotos = (
    await Promise.all(photoKeys.slice(0, 4).map((k) => loadImageFromSignedMediaKey(k)))
  ).filter((img): img is HTMLImageElement => img !== null)

  let cursorY = 316

  // 4. Cuadrícula Polaroid de fotos (si existen fotos esa semana)
  if (loadedPhotos.length > 0) {
    const contentW = COLLAGE_WIDTH - padX * 2
    const gap = 24

    if (loadedPhotos.length === 1) {
      const boxH = 680
      ctx.save()
      ctx.fillStyle = isNight ? '#22222A' : '#FFFFFF'
      ctx.shadowColor = 'rgba(0,0,0,0.10)'
      ctx.shadowBlur = 28
      ctx.shadowOffsetY = 12
      drawRoundedRectPath(ctx, padX, cursorY, contentW, boxH + 36, 36)
      ctx.fill()
      ctx.restore()

      drawCoverImage(ctx, loadedPhotos[0]!, padX + 18, cursorY + 18, contentW - 36, boxH, 24)
      cursorY += boxH + 76
    } else if (loadedPhotos.length === 2) {
      const cellW = (contentW - gap) / 2
      const cellH = 560
      loadedPhotos.forEach((img, idx) => {
        const x = padX + idx * (cellW + gap)
        drawCoverImage(ctx, img, x, cursorY, cellW, cellH, 32)
      })
      cursorY += cellH + 52
    } else {
      const cellW = (contentW - gap) / 2
      const cellH = 380
      loadedPhotos.slice(0, 4).forEach((img, idx) => {
        const col = idx % 2
        const row = Math.floor(idx / 2)
        const x = padX + col * (cellW + gap)
        const y = cursorY + row * (cellH + gap)
        drawCoverImage(ctx, img, x, y, cellW, cellH, 28)
      })
      cursorY += cellH * 2 + gap + 52
    }
  }

  // 5. Tarjetas de mejores frases / respuestas reveladas
  const textHighlights = collage.highlights.filter((h) => h.my_content || h.partner_content)
  const maxQuoteCards = loadedPhotos.length >= 3 ? 2 : loadedPhotos.length > 0 ? 3 : 5
  const cardW = COLLAGE_WIDTH - padX * 2

  for (const item of textHighlights.slice(0, maxQuoteCards)) {
    const cardH = loadedPhotos.length >= 3 ? 250 : 265
    if (cursorY + cardH > COLLAGE_HEIGHT - 140) break

    ctx.save()
    ctx.fillStyle = cardBg
    ctx.strokeStyle = cardBorder
    ctx.lineWidth = 2
    drawRoundedRectPath(ctx, padX, cursorY, cardW, cardH, 28)
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    // Prompt
    ctx.fillStyle = '#FF5C7A'
    ctx.font = '600 24px system-ui, -apple-system, sans-serif'
    const afterPromptY = drawWrappedText(
      ctx,
      item.prompt,
      padX + 34,
      cursorY + 50,
      cardW - 68,
      32,
      2
    )

    // Respuestas lado a lado / apiladas
    let lineY = Math.max(afterPromptY + 12, cursorY + 106)
    ctx.font = '500 26px system-ui, -apple-system, sans-serif'

    if (item.my_content) {
      ctx.fillStyle = primaryText
      const label = item.my_name ? `${item.my_name}: ` : 'Tú: '
      lineY = drawWrappedText(
        ctx,
        `${label}“${item.my_content}”`,
        padX + 34,
        lineY,
        cardW - 68,
        34,
        2
      )
      lineY += 6
    }

    if (item.partner_content && lineY < cursorY + cardH - 22) {
      ctx.fillStyle = mutedText
      const label = item.partner_name ? `${item.partner_name}: ` : 'Pareja: '
      drawWrappedText(
        ctx,
        `${label}“${item.partner_content}”`,
        padX + 34,
        lineY,
        cardW - 68,
        34,
        2
      )
    }

    cursorY += cardH + 24
  }

  // 6. Pie de página minimalista
  ctx.fillStyle = mutedText
  ctx.font = '500 24px system-ui, -apple-system, sans-serif'
  ctx.fillText('Guardado en privado · lazus.app', padX, COLLAGE_HEIGHT - 64)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((out) => resolve(out), 'image/png')
  )
  if (!blob) {
    throw new Error('No se pudo exportar la imagen PNG del collage semanal')
  }
  return blob
}

/**
 * Comparte el collage nativamente (Instagram Stories / WhatsApp) vía Web Share API Level 2
 * con fallback automático a descarga PNG en escritorio o navegadores sin soporte.
 */
export async function shareOrDownloadCollageImage(params: {
  blob: Blob
  filename: string
  title?: string
  text?: string
}): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([params.blob], params.filename, { type: params.blob.type || 'image/png' })

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: params.title ?? 'Nuestro Collage Semanal · LazUs',
        text: params.text ?? 'Nuestros mejores momentos de la semana ❤️',
      })
      return 'shared'
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled'
      }
      // Si el share sheet falla por otro motivo, caemos al fallback de descarga
    }
  }

  const url = URL.createObjectURL(params.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = params.filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
