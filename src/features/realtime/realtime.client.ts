import { SafeRealtimeEventSchema, type SafeRealtimeEvent } from '../../../shared'

export type RealtimeConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface WebSocketLike {
  readonly readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

const WS_CONNECTING = 0
const WS_OPEN = 1

export interface CoupleRealtimeClientOptions {
  url?: string
  onEvent: (event: SafeRealtimeEvent) => void
  onStatusChange?: (status: RealtimeConnectionStatus) => void
  heartbeatIntervalMs?: number
  baseReconnectDelayMs?: number
  maxReconnectDelayMs?: number
  random?: () => number
  createWebSocket?: (url: string) => WebSocketLike
  isOnline?: () => boolean
  getVisibilityState?: () => DocumentVisibilityState
  addWindowListener?: (type: 'online' | 'offline', listener: () => void) => void
  removeWindowListener?: (type: 'online' | 'offline', listener: () => void) => void
  addDocumentListener?: (type: 'visibilitychange', listener: () => void) => void
  removeDocumentListener?: (type: 'visibilitychange', listener: () => void) => void
}

export function buildRealtimeWsUrl(path = '/api/realtime/ws'): string {
  if (typeof window === 'undefined' || !window.location) {
    return `ws://localhost${path}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

/**
 * Cliente WebSocket resiliente para PWA móvil:
 * - Heartbeat 'ping' compatible con setWebSocketAutoResponse('ping', 'pong') del DO ($0/mes).
 * - Validación estricta con SafeRealtimeEventSchema (Zero-Leak).
 * - Backoff exponencial con jitter y reconexión inmediata ante 'online' y 'visibilitychange'.
 */
export class CoupleRealtimeClient {
  private readonly url: string
  private readonly onEvent: (event: SafeRealtimeEvent) => void
  private readonly onStatusChange?: (status: RealtimeConnectionStatus) => void
  private readonly heartbeatIntervalMs: number
  private readonly baseReconnectDelayMs: number
  private readonly maxReconnectDelayMs: number
  private readonly random: () => number
  private readonly createWebSocket: (url: string) => WebSocketLike
  private readonly isOnline: () => boolean
  private readonly getVisibilityState: () => DocumentVisibilityState
  private readonly addWindowListener: (type: 'online' | 'offline', listener: () => void) => void
  private readonly removeWindowListener: (type: 'online' | 'offline', listener: () => void) => void
  private readonly addDocumentListener: (type: 'visibilitychange', listener: () => void) => void
  private readonly removeDocumentListener: (type: 'visibilitychange', listener: () => void) => void

  private socket: WebSocketLike | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private isStarted = false

  constructor(options: CoupleRealtimeClientOptions) {
    this.url = options.url ?? buildRealtimeWsUrl()
    this.onEvent = options.onEvent
    this.onStatusChange = options.onStatusChange
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 25_000
    this.baseReconnectDelayMs = options.baseReconnectDelayMs ?? 1_000
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000
    this.random = options.random ?? Math.random
    this.createWebSocket =
      options.createWebSocket ?? ((targetUrl) => new WebSocket(targetUrl) as unknown as WebSocketLike)
    this.isOnline =
      options.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine))
    this.getVisibilityState =
      options.getVisibilityState ??
      (() => (typeof document === 'undefined' ? 'visible' : document.visibilityState))
    this.addWindowListener =
      options.addWindowListener ??
      ((type, listener) => {
        if (typeof window !== 'undefined') window.addEventListener(type, listener)
      })
    this.removeWindowListener =
      options.removeWindowListener ??
      ((type, listener) => {
        if (typeof window !== 'undefined') window.removeEventListener(type, listener)
      })
    this.addDocumentListener =
      options.addDocumentListener ??
      ((type, listener) => {
        if (typeof document !== 'undefined') document.addEventListener(type, listener)
      })
    this.removeDocumentListener =
      options.removeDocumentListener ??
      ((type, listener) => {
        if (typeof document !== 'undefined') document.removeEventListener(type, listener)
      })
  }

  start(): void {
    if (this.isStarted) return
    this.isStarted = true
    this.addWindowListener('online', this.handleOnline)
    this.addWindowListener('offline', this.handleOffline)
    this.addDocumentListener('visibilitychange', this.handleVisibilityChange)
    this.connect()
  }

  stop(): void {
    if (!this.isStarted) return
    this.isStarted = false
    this.removeWindowListener('online', this.handleOnline)
    this.removeWindowListener('offline', this.handleOffline)
    this.removeDocumentListener('visibilitychange', this.handleVisibilityChange)
    this.clearTimers()

    if (this.socket) {
      const active = this.socket
      this.socket = null
      active.onopen = null
      active.onmessage = null
      active.onclose = null
      active.onerror = null
      try {
        active.close(1000, 'Client stopped')
      } catch {
        // Socket ya cerrado
      }
    }

    this.onStatusChange?.('disconnected')
  }

  private clearTimers(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private connect(): void {
    if (!this.isStarted) return
    if (!this.isOnline()) {
      this.onStatusChange?.('disconnected')
      return
    }
    if (
      this.socket &&
      (this.socket.readyState === WS_CONNECTING || this.socket.readyState === WS_OPEN)
    ) {
      return
    }

    this.clearTimers()
    this.onStatusChange?.('connecting')

    let ws: WebSocketLike
    try {
      ws = this.createWebSocket(this.url)
    } catch {
      this.onStatusChange?.('disconnected')
      this.scheduleReconnect()
      return
    }

    this.socket = ws

    ws.onopen = () => {
      if (!this.isStarted || this.socket !== ws) return
      this.reconnectAttempt = 0
      this.onStatusChange?.('connected')
      this.startHeartbeat(ws)
    }

    ws.onmessage = (event) => {
      if (!this.isStarted || this.socket !== ws) return
      this.handleMessage(event.data)
    }

    ws.onerror = () => {
      // El evento close gestiona la reconexión
    }

    ws.onclose = () => {
      if (this.socket !== ws) return
      this.socket = null
      this.clearTimers()
      this.onStatusChange?.('disconnected')
      if (this.isStarted && this.isOnline()) {
        this.scheduleReconnect()
      }
    }
  }

  private startHeartbeat(ws: WebSocketLike): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
    }
    this.heartbeatTimer = setInterval(() => {
      if (this.socket === ws && ws.readyState === WS_OPEN) {
        try {
          ws.send('ping')
        } catch {
          // El cierre del socket disparará reconexión
        }
      }
    }, this.heartbeatIntervalMs)
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return
    if (data === 'pong') return

    let raw: unknown
    try {
      raw = JSON.parse(data)
    } catch {
      return
    }

    const parsed = SafeRealtimeEventSchema.safeParse(raw)
    if (!parsed.success) {
      return
    }

    this.onEvent(parsed.data)
  }

  private scheduleReconnect(): void {
    if (!this.isStarted || !this.isOnline() || this.reconnectTimer !== null) return

    const exponential = Math.min(
      this.maxReconnectDelayMs,
      this.baseReconnectDelayMs * 2 ** this.reconnectAttempt
    )
    const jitterFactor = 0.75 + 0.5 * this.random()
    const delayMs = Math.round(exponential * jitterFactor)
    this.reconnectAttempt += 1

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delayMs)
  }

  private readonly handleOnline = (): void => {
    if (!this.isStarted) return
    this.reconnectAttempt = 0
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.connect()
  }

  private readonly handleOffline = (): void => {
    if (!this.isStarted) return
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.onStatusChange?.('disconnected')
  }

  private readonly handleVisibilityChange = (): void => {
    if (!this.isStarted) return
    if (this.getVisibilityState() !== 'visible') return
    if (!this.isOnline()) return

    if (this.socket && this.socket.readyState === WS_OPEN) {
      // Reconciliar conexión potencialmente obsoleta tras volver de segundo plano en móvil
      try {
        this.socket.send('ping')
      } catch {
        this.reconnectAttempt = 0
        this.connect()
      }
      return
    }

    this.reconnectAttempt = 0
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.connect()
  }
}
