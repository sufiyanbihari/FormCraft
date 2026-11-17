import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUserFromRequest } from '@/lib/auth/session';
import { verifyAuditAuthFromRequest } from '@/lib/auth/auditAuth';
import { subscribeToAuditEvents, LiveAuditEvent } from '@/lib/audit/auditEventBroker';
import { getSessionInactivityTimeoutMs } from '@/lib/auth/sessionConfig';


export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user || user.role !== 'ADMIN') {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!verifyAuditAuthFromRequest(request)) {
    return new Response('Password verification required', { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Send initial connected event with real-time stats
      try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const cutoff = new Date(now.getTime() - getSessionInactivityTimeoutMs());

        const [allLogsCount, todayCount, activeCount, securityCount] = await Promise.all([
          prisma.formAuditLog.count(),
          prisma.formAuditLog.count({ where: { createdAt: { gte: startOfToday } } }),
          prisma.session.count({
            where: {
              status: 'ACTIVE',
              lastActiveAt: { gte: cutoff },
              expiresAt: { gt: now },
            },
          }),
          prisma.formAuditLog.count({
            where: {
              OR: [
                { action: { contains: 'FAILED', mode: 'insensitive' } },
                { action: { contains: 'TERMINATE', mode: 'insensitive' } },
              ],
            },
          }),
        ]);

        const initialPayload = JSON.stringify({
          type: 'CONNECTED',
          stats: {
            totalLogs: allLogsCount,
            todayLogs: todayCount,
            activeUsersCount: activeCount,
            securityAlertsCount: securityCount,
          },
          timestamp: new Date().toISOString(),
        });

        controller.enqueue(encoder.encode(`data: ${initialPayload}\n\n`));
      } catch (err) {
        console.error('[SSE] Failed to compute initial stats:', err);
      }

      // 2. Subscribe to live audit & session events
      const unsubscribe = subscribeToAuditEvents(async (event: LiveAuditEvent) => {
        try {
          // Re-compute active sessions count if needed to keep stats strictly synchronized
          const now = new Date();
          const cutoff = new Date(now.getTime() - getSessionInactivityTimeoutMs());
          const activeCount = await prisma.session.count({
            where: {
              status: 'ACTIVE',
              lastActiveAt: { gte: cutoff },
              expiresAt: { gt: now },
            },
          });

          const enriched = {
            ...event,
            activeUsersCount: activeCount,
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(enriched)}\n\n`));
        } catch {
          // stream might be closed
        }
      });

      // 3. Keepalive ping every 15s
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(pingInterval);
        }
      }, 15000);

      // 4. Handle connection close
      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
