import { Diagnostics } from './Diagnostics';

export type FunnelEntry = 'map' | 'recommendation' | 'other';

export interface FunnelContext {
  funnelId: string;
  entry: FunnelEntry;
  sellerId: string;
}

let context: FunnelContext | null = null;

function createFunnelId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `funnel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const conversionFunnel = {
  begin(sellerId: string, entry: FunnelEntry = 'map'): FunnelContext {
    const next: FunnelContext = { funnelId: createFunnelId(), entry, sellerId };
    context = next;
    return next;
  },
  current(): FunnelContext | null {
    return context;
  },
  track(step: string, payload: Record<string, unknown> = {}): void {
    const active = context;
    Diagnostics.track(step, {
      ...payload,
      funnelId: active?.funnelId ?? createFunnelId(),
      entry: active?.entry ?? 'other',
    });
  },
};
