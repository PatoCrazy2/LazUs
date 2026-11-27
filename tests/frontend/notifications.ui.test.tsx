import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ContextualPushPrompt,
  IosStandaloneInstallGuide,
  PushSettingsModal,
} from '../../src/features/notifications'

function createPreloadedClient(deviceState: unknown) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  client.setQueryData(['notifications', 'device-state'], deviceState)
  return client
}

describe('Notifications UI Components (iOS Guide, Soft-Ask & Settings Modal) - Fase 3', () => {
  it('renderiza la guía visual de 2 pasos para instalar en pantalla de inicio de iOS Safari', () => {
    const html = renderToStaticMarkup(<IosStandaloneInstallGuide />)
    expect(html).toContain('Instala LazUs en tu iPhone para recibir avisos')
    expect(html).toContain('Compartir')
    expect(html).toContain('Agregar a inicio')
  })

  it('ContextualPushPrompt muestra invitación cálida post-acción con el nombre de la pareja', () => {
    const client = createPreloadedClient({
      env: { capability: 'prompt', isIos: false, isStandalone: true, permission: 'default' },
      localEndpoint: null,
      serverEnabled: true,
      currentDeviceSubscribed: false,
      subscriptionsCount: 0,
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ContextualPushPrompt partnerName="Sofía" variant="post_submission" />
      </QueryClientProvider>
    )

    expect(html).toContain('¿Te avisamos cuando Sofía responda?')
    expect(html).toContain('Activar avisos')
    expect(html).toContain('Ahora no')
  })

  it('ContextualPushPrompt despliega automáticamente la guía iOS cuando Safari no está en standalone', () => {
    const client = createPreloadedClient({
      env: {
        capability: 'ios_needs_install',
        isIos: true,
        isStandalone: false,
        permission: 'unsupported',
      },
      localEndpoint: null,
      serverEnabled: false,
      currentDeviceSubscribed: false,
      subscriptionsCount: 0,
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ContextualPushPrompt partnerName="Sofía" />
      </QueryClientProvider>
    )

    expect(html).toContain('Instala LazUs en tu iPhone para recibir avisos')
    expect(html).not.toContain('Activar avisos')
  })

  it('PushSettingsModal muestra estado activo, botón de prueba de 3s y garantía Zero-Leak', () => {
    const client = createPreloadedClient({
      env: { capability: 'granted', isIos: true, isStandalone: true, permission: 'granted' },
      localEndpoint: 'https://web.push.apple.com/device-1',
      serverEnabled: true,
      currentDeviceSubscribed: true,
      subscriptionsCount: 2,
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <PushSettingsModal isOpen={true} onClose={() => undefined} partnerName="Sofía" />
      </QueryClientProvider>
    )

    expect(html).toContain('Activos en este dispositivo')
    expect(html).toContain('Enviar aviso de prueba (en 3s)')
    expect(html).toContain('Tienes 2 dispositivos vinculados')
    expect(html).toContain('Privacidad Zero-Leak')
  })
})
