import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';
import { sanitizeTelemetry } from '../src/platform-core/diagnostics/sanitizeTelemetry';

const TELEMETRY_ENDPOINT = '/api/diagnostics';
const REPORTS_ENDPOINT = '/api/reports';

const LOG_FILES: Record<string, string> = {
  [TELEMETRY_ENDPOINT]: 'telemetry.jsonl',
  [REPORTS_ENDPOINT]: 'reports.jsonl',
};

interface LocalTelemetryOptions {
  dir: string;
}

interface IncomingMessageLike {
  on(event: 'data', listener: (chunk: Buffer) => void): void;
  on(event: 'end', listener: () => void): void;
}

interface ServerResponseLike {
  statusCode: number;
  end(chunk?: string): void;
}

export function localTelemetry(options: LocalTelemetryOptions): Plugin {
  const appendLine = (filePath: string, line: string): Promise<void> => {
    const write = writeChain.then(async () => {
      await fs.mkdir(options.dir, { recursive: true });
      await fs.appendFile(filePath, `${line}\n`, 'utf8');
    });
    writeChain = write.catch(() => undefined);
    return write;
  };

  let writeChain: Promise<void> = Promise.resolve();

  const handler = (filePath: string): Connect.NextHandleFunction => (req, res) => {
    const incoming = req as Connect.IncomingMessage & IncomingMessageLike;
    const outgoing = res as Connect.ServerResponse & ServerResponseLike;
    let body = '';
    incoming.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    incoming.on('end', async () => {
      let events: unknown;
      try {
        events = JSON.parse(body);
      } catch {
        outgoing.statusCode = 400;
        outgoing.end('{"error":"invalid json"}');
        return;
      }
      if (!Array.isArray(events)) {
        outgoing.statusCode = 400;
        outgoing.end('{"error":"expected array"}');
        return;
      }
      try {
        for (const rawEvent of events) {
          const event = sanitizeTelemetry(rawEvent);
          if (event === undefined) continue;
          await appendLine(filePath, JSON.stringify(event));
        }
        outgoing.statusCode = 204;
        outgoing.end();
      } catch (error) {
        outgoing.statusCode = 500;
        outgoing.end(`{"error":"write failed: ${String(error)}"}`);
      }
    });
  };

  return {
    name: 'greenmarket:local-telemetry',
    configureServer(server) {
      for (const [endpoint, fileName] of Object.entries(LOG_FILES)) {
        server.middlewares.use(endpoint, handler(path.join(options.dir, fileName)));
      }
    },
  };
}
