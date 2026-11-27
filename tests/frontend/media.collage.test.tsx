import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WeeklyCollageItem } from '../../shared'
import {
  MomentsGalleryView,
  formatWeekRangeLabel,
  getSignedMediaQueryKey,
  shareOrDownloadCollageImage,
} from '../../src/features/media'

describe('Fase 5: Collage Semanal 9:16 ("Nuestros Momentos") y Web Share API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('formatea correctamente el rango semanal YYYY-MM-DD', () => {
    const label = formatWeekRangeLabel('2026-11-23', '2026-11-29')
    expect(label).toContain('23')
    expect(label).toContain('29')
  })

  it('usa Web Share API Level 2 (navigator.share con files) cuando el dispositivo lo soporta', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    const canShareMock = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', {
      share: shareMock,
      canShare: canShareMock,
    })

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const result = await shareOrDownloadCollageImage({
      blob,
      filename: 'lazus-semana-2026-11-23.png',
    })

    expect(result).toBe('shared')
    expect(canShareMock).toHaveBeenCalledTimes(1)
    expect(shareMock).toHaveBeenCalledTimes(1)
  })

  it('maneja AbortError silenciosamente cuando el usuario cierra el menú de compartir', async () => {
    const abortErr = new Error('User cancelled')
    abortErr.name = 'AbortError'
    vi.stubGlobal('navigator', {
      canShare: vi.fn().mockReturnValue(true),
      share: vi.fn().mockRejectedValue(abortErr),
    })

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const result = await shareOrDownloadCollageImage({
      blob,
      filename: 'lazus-semana-2026-11-23.png',
    })

    expect(result).toBe('cancelled')
  })

  it('renderiza MomentsGalleryView en estado vacío, ready y rendered con botón de compartir', () => {
    const queryClient = new QueryClient()
    const noop = async () => undefined

    const emptyHtml = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MomentsGalleryView
          collages={[]}
          isLoading={false}
          isRendering={false}
          onGenerate={noop}
          onShare={noop}
          sharingId={null}
          feedbackMessage={null}
          errorMessage={null}
        />
      </QueryClientProvider>
    )
    expect(emptyHtml).toContain('Nuestros Momentos')
    expect(emptyHtml).toContain('Tu álbum semanal te espera')

    const readyCollage: WeeklyCollageItem = {
      id: '11111111-1111-4111-8111-111111111111',
      couple_id: '22222222-2222-4222-8222-222222222222',
      week_start_date: '2026-11-23',
      week_end_date: '2026-11-29',
      status: 'ready',
      media_key: null,
      highlights: [],
      activities_count: 4,
      rendered_at: null,
      created_at: '2026-11-26T19:00:00.000Z',
    }

    const readyHtml = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MomentsGalleryView
          collages={[readyCollage]}
          isLoading={false}
          isRendering={false}
          onGenerate={noop}
          onShare={noop}
          sharingId={null}
          feedbackMessage={null}
          errorMessage={null}
        />
      </QueryClientProvider>
    )
    expect(readyHtml).toContain('Listo para crear')
    expect(readyHtml).toContain('Generar collage 9:16')
    expect(readyHtml).toContain('4 recuerdos revelados')

    const renderedKey = 'couples/c1/collage/week-1.png'
    queryClient.setQueryData(
      getSignedMediaQueryKey(renderedKey),
      'https://acc.r2.cloudflarestorage.com/lazus-media/couples/c1/collage/week-1.png?sig=ok'
    )

    const renderedHtml = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MomentsGalleryView
          collages={[
            {
              ...readyCollage,
              status: 'rendered',
              media_key: renderedKey,
              rendered_at: '2026-11-26T19:10:00.000Z',
            },
          ]}
          isLoading={false}
          isRendering={false}
          onGenerate={noop}
          onShare={noop}
          sharingId={null}
          feedbackMessage={null}
          errorMessage={null}
        />
      </QueryClientProvider>
    )
    expect(renderedHtml).toContain('Guardado')
    expect(renderedHtml).toContain('Compartir / Guardar')
    expect(renderedHtml).toContain('week-1.png')
  })
})
