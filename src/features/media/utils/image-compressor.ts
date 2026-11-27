export interface CompressedImageResult {
  blob: Blob
  contentType: 'image/webp' | 'image/jpeg'
  width: number
  height: number
  sizeBytes: number
}

export interface CompressImageOptions {
  maxDimension?: number
  quality?: number
}

function loadImageElement(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen seleccionada'))
    }
    img.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: 'image/webp' | 'image/jpeg',
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality)
  })
}

/**
 * Comprime y redimensiona imágenes en el navegador a Full HD (1920px lado mayor)
 * en WebP calidad 0.85 (~350-500 KB) con fallback automático a JPEG.
 */
export async function compressImageToWebP(
  file: Blob,
  options: CompressImageOptions = {}
): Promise<CompressedImageResult> {
  const maxDimension = options.maxDimension ?? 1920
  const quality = options.quality ?? 0.85

  const img = await loadImageElement(file)
  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height

  if (!naturalWidth || !naturalHeight) {
    throw new Error('La imagen no tiene dimensiones válidas')
  }

  const longestSide = Math.max(naturalWidth, naturalHeight)
  const scale = longestSide > maxDimension ? maxDimension / longestSide : 1
  const targetWidth = Math.max(1, Math.round(naturalWidth * scale))
  const targetHeight = Math.max(1, Math.round(naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('No se pudo inicializar el motor gráfico para optimizar la imagen')
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  let blob = await canvasToBlob(canvas, 'image/webp', quality)
  let contentType: 'image/webp' | 'image/jpeg' = 'image/webp'

  // Fallback automático si el navegador no soporta codificación WebP en canvas
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    contentType = 'image/jpeg'
  }

  if (!blob) {
    throw new Error('Error al comprimir la fotografía')
  }

  return {
    blob,
    contentType,
    width: targetWidth,
    height: targetHeight,
    sizeBytes: blob.size,
  }
}
