import Dexie, { type EntityTable } from 'dexie'
import type { MutationType, OutboxStatus } from '../../shared'

// Modelos locales de Dexie (Velocidad, offline y UX instantánea)
export interface LocalProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  coupleId?: string;
  emailVerified?: boolean;
  hasPassword?: boolean;
}

export interface LocalCouple {
  id: string;
  status: 'pending' | 'active' | 'paused' | 'archived';
  partnerId?: string;
  partnerName?: string;
  anniversaryDate?: string;
}

export interface LocalActivity {
  id: string;
  logicalDate: string;
  prompt: string;
  status: 'pending' | 'revealed';
  mySubmissionCompleted: boolean;
  partnerSubmissionCompleted: boolean;
  myContent?: string;
  partnerContent?: string; // Solo presente si status === 'revealed'
  revealedAt?: string;
}

export interface LocalOutboxItem {
  id: string; // UUID local
  client_mutation_id: string; // UUIDv4 para idempotencia en PostgreSQL
  mutation_type: MutationType;
  payload: Record<string, unknown>;
  created_at: number;
  attempt_count: number;
  status: OutboxStatus;
  last_error?: string;
  next_retry_at?: number;
}

// Inicialización de la base de datos Dexie
export const db = new Dexie('LazUsLocalDB') as Dexie & {
  profile: EntityTable<LocalProfile, 'id'>
  couple: EntityTable<LocalCouple, 'id'>
  activities: EntityTable<LocalActivity, 'id'>
  outbox: EntityTable<LocalOutboxItem, 'id'>
}

db.version(1).stores({
  profile: 'id, email',
  couple: 'id',
  activities: 'id, logicalDate, status',
  outbox: 'id, client_mutation_id, status, next_retry_at',
})

// Solicitar persistencia al sistema operativo (Safari / Android)
export async function ensureStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    return await navigator.storage.persist()
  }
  return false
}
