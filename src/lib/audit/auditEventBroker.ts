/**
 * Real-time In-Process Event Broker for FormCraft System Audit Logs & Active Sessions.
 * Dispatches live audit entries, session lifecycle updates, and KPI counts to SSE clients.
 */

import { EventEmitter } from 'events';

// Increase default max listeners for multiple simultaneous admin dashboards
const auditEmitter = new EventEmitter();
auditEmitter.setMaxListeners(100);

export interface LiveAuditEvent {
  type: 'AUDIT_LOG_CREATED' | 'SESSION_UPDATED' | 'SESSION_TERMINATED' | 'STATS_CHANGED';
  data: any;
  timestamp: string;
}

export function broadcastAuditEvent(action: string, log: any) {
  try {
    const event: LiveAuditEvent = {
      type: 'AUDIT_LOG_CREATED',
      data: { action, log },
      timestamp: new Date().toISOString(),
    };
    auditEmitter.emit('audit_event', event);
  } catch (err) {
    console.error('[EventBroker] Broadcast error:', err);
  }
}

export function broadcastSessionEvent(type: 'SESSION_UPDATED' | 'SESSION_TERMINATED', sessionData: any) {
  try {
    const event: LiveAuditEvent = {
      type,
      data: sessionData,
      timestamp: new Date().toISOString(),
    };
    auditEmitter.emit('session_event', event);
  } catch (err) {
    console.error('[EventBroker] Session broadcast error:', err);
  }
}

export function subscribeToAuditEvents(callback: (event: LiveAuditEvent) => void): () => void {
  const handler = (event: LiveAuditEvent) => {
    callback(event);
  };

  auditEmitter.on('audit_event', handler);
  auditEmitter.on('session_event', handler);

  return () => {
    auditEmitter.off('audit_event', handler);
    auditEmitter.off('session_event', handler);
  };
}

export { auditEmitter };
