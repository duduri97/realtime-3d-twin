import { useCallback, useEffect, useMemo, useState } from 'react';
import { TwinCanvas, type RenderMetrics } from './TwinCanvas';
import { Map2DPanel } from './Map2DPanel';
import {
  createEquipmentGrid,
  stepTelemetry,
  type AlarmEvent,
  type EquipmentNode,
} from './sensorStream';
import {
  gridToWgs84,
  probeBackends,
  querySpatialOpenApi,
  querySqlTuningHistory,
  sendConcurrentAcks,
  type BackendConnectionState,
  type SpatialNodeInfo,
  type SqlHistoryInfo,
} from './ecosystemClient';

export default function App() {
  const [equipCount, setEquipCount] = useState(1600);
  const [viewMode, setViewMode] = useState<'3D' | '2D' | 'SPLIT'>('SPLIT');
  const [useInstancing, setUseInstancing] = useState(true);
  const [streaming, setStreaming] = useState(true);
  const [revision, setRevision] = useState(0);
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [selected, setSelected] = useState<EquipmentNode | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<RenderMetrics>({ fps: 60, drawCalls: 1, triangles: 0 });

  const [conn, setConn] = useState<BackendConnectionState>({
    spatialOnline: false,
    sqlLabOnline: false,
    seededRows: 0,
  });
  const [spatialInfo, setSpatialInfo] = useState<SpatialNodeInfo | null>(null);
  const [sqlInfo, setSqlInfo] = useState<SqlHistoryInfo | null>(null);
  const [ackBusy, setAckBusy] = useState(false);

  const nodes = useMemo(() => createEquipmentGrid(equipCount), [equipCount]);

  const refreshConnections = useCallback(async () => {
    const state = await probeBackends();
    setConn(state);
    return state;
  }, []);

  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  useEffect(() => {
    setAlarms([]);
    setSelected(null);
    setFocusIndex(null);
    setSpatialInfo(null);
    setSqlInfo(null);
    setRevision((r) => r + 1);
  }, [nodes]);

  const inspectNodeAcrossEcosystem = useCallback(
    async (node: EquipmentNode) => {
      setSelected(node);
      setFocusIndex(node.index);

      if (conn.spatialOnline) {
        querySpatialOpenApi(node.x, node.z)
          .then(setSpatialInfo)
          .catch(() => setSpatialInfo(null));
      } else {
        setSpatialInfo(null);
      }

      if (conn.sqlLabOnline) {
        querySqlTuningHistory(node.id)
          .then(setSqlInfo)
          .catch(() => setSqlInfo(null));
      } else {
        setSqlInfo(null);
      }
    },
    [conn.spatialOnline, conn.sqlLabOnline]
  );

  const handleConcurrentAck = async (mode: 'PESSIMISTIC' | 'OPTIMISTIC') => {
    if (!selected || !conn.sqlLabOnline) return;
    setAckBusy(true);
    try {
      const latestCount = await sendConcurrentAcks(selected.id, 8, mode);
      setSqlInfo((prev) => (prev ? { ...prev, ackCount: latestCount } : prev));
    } finally {
      setAckBusy(false);
    }
  };

  useEffect(() => {
    if (!streaming) return;
    const timer = window.setInterval(() => {
      const { changedIndices, newAlarms } = stepTelemetry(nodes, Math.max(12, Math.floor(nodes.length / 60)));
      if (changedIndices.length > 0) {
        setRevision((r) => r + 1);
      }
      if (newAlarms.length > 0) {
        setAlarms((prev) => [...newAlarms, ...prev].slice(0, 30));
      }
    }, 600);
    return () => window.clearInterval(timer);
  }, [streaming, nodes]);

  const counts = useMemo(() => {
    let warn = 0;
    let alarm = 0;
    for (const n of nodes) {
      if (n.status === 'WARN') warn++;
      else if (n.status === 'ALARM') alarm++;
    }
    return { normal: nodes.length - warn - alarm, warn, alarm };
  }, [nodes, revision]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <header>
          <h1>Realtime 3D Digital Twin</h1>
          <p className="sub">Dual-Mode Ecosystem · Three.js InstancedMesh</p>
        </header>

        <section className="card">
          <div className="row-between">
            <h2>백엔드 생태계 연동 상태</h2>
            <button className="mini-btn" onClick={refreshConnections}>재연결 확인</button>
          </div>
          <div className="eco-list">
            <div className="eco-item">
              <span>spatial-openapi-sdk (:8080)</span>
              <strong className={conn.spatialOnline ? 'ok' : 'muted'}>
                {conn.spatialOnline ? 'CONNECTED' : 'STANDALONE'}
              </strong>
            </div>
            <div className="eco-item">
              <span>sql-tuning-lab (:8081)</span>
              <strong className={conn.sqlLabOnline ? 'ok' : 'muted'}>
                {conn.sqlLabOnline ? `CONNECTED (${conn.seededRows.toLocaleString()} rows)` : 'STANDALONE'}
              </strong>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>렌더링 성능 HUD</h2>
          <div className="kpi-grid">
            <div className="kpi">
              <span>FPS</span>
              <strong>{metrics.fps}</strong>
            </div>
            <div className="kpi">
              <span>Draw Calls</span>
              <strong className={metrics.drawCalls > 100 ? 'danger' : 'ok'}>
                {metrics.drawCalls.toLocaleString()}
              </strong>
            </div>
            <div className="kpi">
              <span>설비 수</span>
              <strong>{equipCount.toLocaleString()}</strong>
            </div>
            <div className="kpi">
              <span>Triangles</span>
              <strong>{metrics.triangles.toLocaleString()}</strong>
            </div>
          </div>

          <div className="controls">
            <label>
              렌더링 방식
              <select
                value={useInstancing ? 'instanced' : 'standard'}
                onChange={(e) => setUseInstancing(e.target.value === 'instanced')}
              >
                <option value="instanced">InstancedMesh (1 Draw Call)</option>
                <option value="standard">Individual Mesh (N Draw Calls)</option>
              </select>
            </label>
            <label>
              가상 설비 규모
              <select
                value={equipCount}
                onChange={(e) => setEquipCount(Number(e.target.value))}
              >
                <option value={400}>400대</option>
                <option value={1600}>1,600대</option>
                <option value={2500}>2,500대</option>
              </select>
            </label>
            <button onClick={() => setStreaming((s) => !s)}>
              {streaming ? '센서 스트림 일시정지' : '센서 스트림 재개'}
            </button>
          </div>
        </section>

        <section className="card">
          <h2>설비 상세 &amp; 크로스 서비스 데이터</h2>
          <div className="status-row">
            <span className="pill normal">정상 {counts.normal}</span>
            <span className="pill warn">주의 {counts.warn}</span>
            <span className="pill alarm">알람 {counts.alarm}</span>
          </div>

          {selected ? (
            <div className="selected-box">
              <strong>{selected.id}</strong> ({selected.bay}) — {selected.status}
              <div>온도: {selected.temperature}°C · 진동: {selected.vibration} mm/s</div>
              <div>WGS84: {gridToWgs84(selected.x, selected.z).join(', ')}</div>

              {spatialInfo && (
                <div className="sub-box">
                  <strong>[spatial-openapi-sdk]</strong>
                  <div>EPSG:5179: {spatialInfo.utmkX}, {spatialInfo.utmkY}</div>
                  <div>OpenAPI 누적 {spatialInfo.totalOpenApiRequests}회 (롤업 절감 {spatialInfo.rowReductionPercent}%)</div>
                </div>
              )}

              {sqlInfo && (
                <div className="sub-box">
                  <strong>[sql-tuning-lab · {sqlInfo.mappedAccountNo}]</strong>
                  <div>Full Scan {sqlInfo.beforeMs}ms → Index {sqlInfo.afterMs}ms ({sqlInfo.speedupFactor}x)</div>
                  <div>누적 알람 ACK: <strong>{sqlInfo.ackCount}회</strong></div>
                  <div className="ack-row">
                    <button disabled={ackBusy} onClick={() => handleConcurrentAck('PESSIMISTIC')}>
                      비관적 락 8건 동시 ACK
                    </button>
                    <button disabled={ackBusy} onClick={() => handleConcurrentAck('OPTIMISTIC')}>
                      낙관적 락 8건 동시 ACK
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="hint">3D 설비나 아래 알람을 클릭하면 좌표변환(:8080) 및 대용량 이력/락(:8081) 결과를 조회합니다.</p>
          )}
        </section>

        <section className="card alarm-panel">
          <h2>실시간 알람 피드 (클릭 시 포커싱)</h2>
          <ul className="alarm-list">
            {alarms.length === 0 && <li className="empty">수신된 알람 대기 중...</li>}
            {alarms.map((ev) => (
              <li
                key={ev.eventId}
                className={ev.status === 'ALARM' ? 'item-alarm' : 'item-warn'}
                onClick={() => inspectNodeAcrossEcosystem(nodes[ev.equipIndex])}
              >
                <div>
                  <strong>{ev.equipId}</strong> <span>({ev.bay})</span>
                </div>
                <div className="meta">
                  {ev.temperature}°C · {ev.timestamp}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="viewport">
        <div className="view-mode-bar">
          <button
            className={viewMode === 'SPLIT' ? 'mode-btn active' : 'mode-btn'}
            onClick={() => setViewMode('SPLIT')}
          >
            2D WMS · 3D 트윈 분할 연동
          </button>
          <button
            className={viewMode === '3D' ? 'mode-btn active' : 'mode-btn'}
            onClick={() => setViewMode('3D')}
          >
            3D 디지털 트윈 (Three.js)
          </button>
          <button
            className={viewMode === '2D' ? 'mode-btn active' : 'mode-btn'}
            onClick={() => setViewMode('2D')}
          >
            2D 이미지 지도 (OpenLayers · GeoServer WMS)
          </button>
        </div>

        <div className={`stage stage-${viewMode.toLowerCase()}`}>
          {(viewMode === '2D' || viewMode === 'SPLIT') && (
            <div className="pane">
              <Map2DPanel
                nodes={nodes}
                revision={revision}
                selected={selected}
                spatialOnline={conn.spatialOnline}
                onSelectNode={inspectNodeAcrossEcosystem}
              />
            </div>
          )}
          {(viewMode === '3D' || viewMode === 'SPLIT') && (
            <div className="pane">
              <TwinCanvas
                nodes={nodes}
                useInstancing={useInstancing}
                revision={revision}
                focusIndex={focusIndex}
                onSelectNode={inspectNodeAcrossEcosystem}
                onMetrics={setMetrics}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
