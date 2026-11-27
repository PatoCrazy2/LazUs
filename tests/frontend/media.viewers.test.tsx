import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VIEW_URL_TTL_SECONDS } from '../../shared'
import { SubmissionPreview } from '../../src/features/activities/components/SubmissionPreview'
import {
  PrivateMediaImage,
  SIGNED_MEDIA_STALE_MS,
  getSignedMediaQueryKey,
} from '../../src/features/media'

describe('Fase 4: Visualización Privada en Blind Reveal e Historial', () => {
  it('mantiene staleTime estrictamente menor al TTL de 15 min de R2', () => {
    expect(SIGNED_MEDIA_STALE_MS).toBeLessThan(VIEW_URL_TTL_SECONDS * 1000)
  })

  it('renderiza skeleton de carga mientras se solicita la URL firmada privada', () => {
    const queryClient = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <PrivateMediaImage mediaKey="couples/c1/photo/test.webp" />
      </QueryClientProvider>
    )
    expect(html).toContain('Cargando fotografía privada')
  })

  it('renderiza fotografía privada y texto en SubmissionPreview cuando hay URL firmada en caché', () => {
    const queryClient = new QueryClient()
    const mediaKey = 'couples/c1/photo/sunset.webp'
    const signedUrl = 'https://acc.r2.cloudflarestorage.com/lazus-media/couples/c1/photo/sunset.webp?sig=abc'
    queryClient.setQueryData(getSignedMediaQueryKey(mediaKey), signedUrl)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SubmissionPreview
          label="Sofía"
          submission={{
            content: 'Nuestro café favorito',
            media_key: mediaKey,
            payload: { type: 'photo', width: 1920, height: 1080, mime_type: 'image/webp' },
            completed_at: '2026-11-26T19:00:00.000Z',
          }}
        />
      </QueryClientProvider>
    )

    expect(html).toContain('Sofía')
    expect(html).toContain('Nuestro café favorito')
    expect(html).toContain('Fotografía de Sofía')
    expect(html).toContain('sunset.webp')
  })

  it('renderiza reproductor privado de nota de voz con duración formateada', () => {
    const queryClient = new QueryClient()
    const mediaKey = 'couples/c1/voice/note.webm'
    queryClient.setQueryData(
      getSignedMediaQueryKey(mediaKey),
      'https://acc.r2.cloudflarestorage.com/lazus-media/couples/c1/voice/note.webm?sig=xyz'
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SubmissionPreview
          label="Tú"
          submission={{
            content: null,
            media_key: mediaKey,
            payload: { type: 'voice', duration_sec: 14, mime_type: 'audio/webm' },
            completed_at: '2026-11-26T19:00:00.000Z',
          }}
        />
      </QueryClientProvider>
    )

    expect(html).toContain('<audio')
    expect(html).toContain('Reproducir nota de voz')
    expect(html).toContain('0:14')
  })

  it('muestra aviso claro de sincronización pendiente cuando se selló foto o voz offline', () => {
    const queryClient = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SubmissionPreview
          label="Tú"
          submission={{
            content: null,
            media_key: null,
            payload: { type: 'photo', width: 1920, height: 1080, mime_type: 'image/webp' },
            completed_at: '2026-11-26T19:00:00.000Z',
          }}
        />
      </QueryClientProvider>
    )

    expect(html).toContain('Fotografía guardada · Se sincronizará al recuperar señal')
  })
})
