const LOCATION_KEYS = new Set([
  'center',
  'lat',
  'lng',
  'lon',
  'latlng',
  'latitude',
  'longitude',
  'coordinates',
  'coords',
  'position',
  'pos',
  'location',
  'loc',
  'geo',
  'geometry',
]);

function isCoordinate(value: Record<string, unknown>): boolean {
  const lat = value['lat'] ?? value['latitude'];
  const lng = value['lng'] ?? value['lon'] ?? value['longitude'];
  return typeof lat === 'number' && typeof lng === 'number';
}

export function sanitizeTelemetry(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeTelemetry);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (isCoordinate(record)) return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (LOCATION_KEYS.has(key)) continue;
    const result = sanitizeTelemetry(item);
    if (result !== undefined) cleaned[key] = result;
  }
  return cleaned;
}
