import { sanitizeTelemetry } from './sanitizeTelemetry';
import { readOrCreateSessionId } from './telemetrySession';

const REPORTS_ENDPOINT = '/api/reports';

export interface ProblemReport {
  sellerId: string;
  message: string;
}

interface OutboundReport extends ProblemReport {
  sessionId: string;
  timestamp: number;
}

export function submitProblemReport(report: ProblemReport): Promise<boolean> {
  const payload = sanitizeTelemetry({
    ...report,
    sessionId: readOrCreateSessionId(),
    timestamp: Date.now(),
  }) as unknown as OutboundReport;

  return fetch(REPORTS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([payload]),
    keepalive: true,
  })
    .then((response) => response.ok)
    .catch(() => false);
}
