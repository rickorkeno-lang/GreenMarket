import type { DiagnosticEvent, DiagnosticsSink } from './Diagnostics';
import { sanitizeTelemetry } from './sanitizeTelemetry';
import { readOrCreateSessionId } from './telemetrySession';

const ENDPOINT = '/api/diagnostics';

interface OutboundEvent extends DiagnosticEvent {
  sessionId: string;
}

interface LocalFileSinkOptions {
  endpoint?: string;
  flushIntervalMs?: number;
  batchSize?: number;
  maxBufferSize?: number;
}

export interface LocalFileSink {
  sink: DiagnosticsSink;
  dispose(): void;
}

export function createLocalFileSink(options: LocalFileSinkOptions = {}): LocalFileSink {
  const endpoint = options.endpoint ?? ENDPOINT;
  const flushIntervalMs = options.flushIntervalMs ?? 2000;
  const batchSize = options.batchSize ?? 25;
  const maxBufferSize = options.maxBufferSize ?? 500;
  const sessionId = readOrCreateSessionId();

  let buffer: OutboundEvent[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  const send = (events: OutboundEvent[], unload = false): void => {
    const body = JSON.stringify(events);
    if (unload && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))) return;
    }
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      buffer = [...events, ...buffer].slice(0, maxBufferSize);
    });
  };

  const flush = (): void => {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    send(batch);
  };

  const flushOnUnload = (): void => {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    send(batch, true);
  };

  if (typeof window !== 'undefined') {
    timer = setInterval(flush, flushIntervalMs);
    window.addEventListener('pagehide', flushOnUnload);
  }

  return {
    sink: (event: DiagnosticEvent): void => {
      buffer.push({
        ...event,
        sessionId,
        payload: sanitizeTelemetry(event.payload) as Record<string, unknown> | undefined,
      });
      if (buffer.length >= batchSize) flush();
    },
    dispose: (): void => {
      if (timer !== undefined) clearInterval(timer);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', flushOnUnload);
      flush();
    },
  };
}
