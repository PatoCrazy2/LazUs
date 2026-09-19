export * from './schemas/common.schema'
export * from './schemas/auth.schema'

// Eventos de WebSocket seguros (Durable Objects) — Cero filtrado de secretos
export type SafeRealtimeEvent =
  | { type: 'partner_online'; userId: string; timestamp: string }
  | { type: 'partner_offline'; userId: string; timestamp: string }
  | { type: 'partner_submission_completed'; activityId: string; timestamp: string }
  | { type: 'activity_ready_to_reveal'; activityId: string; timestamp: string }
  | { type: 'affection_received'; senderUserId: string; eventType: string; timestamp: string }
