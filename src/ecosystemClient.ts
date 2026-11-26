export interface SpatialNodeInfo {
  wgs84: [number, number];
  utmkX: number;
  utmkY: number;
  totalOpenApiRequests: number;
  rowReductionPercent: number;
}

export interface SqlHistoryInfo {
  mappedAccountNo: string;
  totalSeededRows: number;
  beforeMs: number;
  afterMs: number;
  speedupFactor: number;
  usesCompositeIndex: boolean;
  ackCount: number;
}

export interface BackendConnectionState {
  spatialOnline: boolean;
  sqlLabOnline: boolean;
  seededRows: number;
}

const DEFAULT_SPATIAL_URL = 'http://localhost:8080';
const DEFAULT_SQLLAB_URL = 'http://localhost:8081';
const DEFAULT_API_KEY = 'demo-spatial-key-2026';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 1500): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function probeBackends(
  spatialUrl = DEFAULT_SPATIAL_URL,
  sqlLabUrl = DEFAULT_SQLLAB_URL
): Promise<BackendConnectionState> {
  let spatialOnline = false;
  let sqlLabOnline = false;
  let seededRows = 0;

  await Promise.all([
    fetchWithTimeout(`${spatialUrl}/api/v1/health`)
      .then((r) => {
        if (r.ok) spatialOnline = true;
      })
      .catch(() => {}),
    fetchWithTimeout(`${sqlLabUrl}/api/v1/benchmark/health`)
      .then(async (r) => {
        if (r.ok) {
          sqlLabOnline = true;
          const data = await r.json();
          seededRows = Number(data.seededRows || 0);
        }
      })
      .catch(() => {}),
  ]);

  return { spatialOnline, sqlLabOnline, seededRows };
}

// Converts local grid (x, z) around Seoul City Hall anchor (126.9780, 37.5665)
export function gridToWgs84(x: number, z: number): [number, number] {
  const lon = Number((126.978 + x * 0.00012).toFixed(6));
  const lat = Number((37.5665 - z * 0.0001).toFixed(6));
  return [lon, lat];
}

export async function querySpatialOpenApi(
  x: number,
  z: number,
  spatialUrl = DEFAULT_SPATIAL_URL,
  apiKey = DEFAULT_API_KEY
): Promise<SpatialNodeInfo> {
  const [lon, lat] = gridToWgs84(x, z);
  const [txRes, metricsRes] = await Promise.all([
    fetchWithTimeout(
      `${spatialUrl}/openapi/v1/transform?x=${lon}&y=${lat}&from=EPSG:4326&to=EPSG:5179`,
      { headers: { 'X-API-Key': apiKey } },
      2500
    ).then((r) => r.json()),
    fetchWithTimeout(`${spatialUrl}/api/v1/metrics/summary`, {}, 2500).then((r) => r.json()),
  ]);

  return {
    wgs84: [lon, lat],
    utmkX: Number(txRes.x),
    utmkY: Number(txRes.y),
    totalOpenApiRequests: Number(metricsRes.totalRequests || 0),
    rowReductionPercent: Number(metricsRes.rowReductionPercent || 0),
  };
}

export async function querySqlTuningHistory(
  equipId: string,
  sqlLabUrl = DEFAULT_SQLLAB_URL
): Promise<SqlHistoryInfo> {
  const res = await fetchWithTimeout(
    `${sqlLabUrl}/api/v1/benchmark/equip-history?equipId=${encodeURIComponent(equipId)}`,
    {},
    3000
  );
  const d = await res.json();
  return {
    mappedAccountNo: d.mappedAccountNo,
    totalSeededRows: Number(d.totalSeededRows || 0),
    beforeMs: Number(d.beforeMs || 0),
    afterMs: Number(d.afterMs || 0),
    speedupFactor: Number(d.speedupFactor || 1),
    usesCompositeIndex: Boolean(d.usesCompositeIndex),
    ackCount: Number(d.ackCount || 0),
  };
}

export async function sendConcurrentAcks(
  equipId: string,
  concurrency = 8,
  mode: 'PESSIMISTIC' | 'OPTIMISTIC' = 'PESSIMISTIC',
  sqlLabUrl = DEFAULT_SQLLAB_URL
): Promise<number> {
  const calls = Array.from({ length: concurrency }, () =>
    fetchWithTimeout(
      `${sqlLabUrl}/api/v1/benchmark/ack?equipId=${encodeURIComponent(equipId)}&mode=${mode}`,
      { method: 'POST' },
      5000
    ).then((r) => r.json())
  );
  const results = await Promise.all(calls);
  return Math.max(...results.map((r) => Number(r.ackCount || 0)));
}
