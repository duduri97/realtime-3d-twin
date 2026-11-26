import { useEffect, useMemo, useState } from 'react';
import { TwinCanvas, type RenderMetrics } from './TwinCanvas';
import {
  createEquipmentGrid,
  stepTelemetry,
  type AlarmEvent,
  type EquipmentNode,
} from './sensorStream';

export default function App() {
  const [equipCount, setEquipCount] = useState(1600);
  const [useInstancing, setUseInstancing] = useState(true);
  const [streaming, setStreaming] = useState(true);
  const [revision, setRevision] = useState(0);
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [selected, setSelected] = useState<EquipmentNode | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<RenderMetrics>({ fps: 60, drawCalls: 1, triangles: 0 });

  const nodes = useMemo(() => createEquipmentGrid(equipCount), [equipCount]);

  useEffect(() => {
    setAlarms([]);
    setSelected(null);
    setFocusIndex(null);
    setRevision((r) => r + 1);
  }, [nodes]);

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
          <p className="sub">Three.js InstancedMesh · Live Sensor Stream</p>
        </header>

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
          <h2>설비 상태 분포</h2>
          <div className="status-row">
            <span className="pill normal">정상 {counts.normal}</span>
            <span className="pill warn">주의 {counts.warn}</span>
            <span className="pill alarm">알람 {counts.alarm}</span>
          </div>
          {selected && (
            <div className="selected-box">
              <strong>{selected.id}</strong> ({selected.bay}) — {selected.status}
              <div>온도: {selected.temperature}°C · 진동: {selected.vibration} mm/s</div>
            </div>
          )}
        </section>

        <section className="card alarm-panel">
          <h2>실시간 알람 피드 (클릭 시 카메라 이동)</h2>
          <ul className="alarm-list">
            {alarms.length === 0 && <li className="empty">수신된 알람 대기 중...</li>}
            {alarms.map((ev) => (
              <li
                key={ev.eventId}
                className={ev.status === 'ALARM' ? 'item-alarm' : 'item-warn'}
                onClick={() => {
                  setFocusIndex(ev.equipIndex);
                  setSelected(nodes[ev.equipIndex]);
                }}
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
        <TwinCanvas
          nodes={nodes}
          useInstancing={useInstancing}
          revision={revision}
          focusIndex={focusIndex}
          onSelectNode={(n) => {
            setSelected(n);
            setFocusIndex(n.index);
          }}
          onMetrics={setMetrics}
        />
      </main>
    </div>
  );
}
