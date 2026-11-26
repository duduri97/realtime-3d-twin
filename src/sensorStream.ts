export type EquipStatus = 'NORMAL' | 'WARN' | 'ALARM';

export interface EquipmentNode {
  index: number;
  id: string;
  bay: string;
  x: number;
  z: number;
  height: number;
  temperature: number;
  vibration: number;
  status: EquipStatus;
}

export interface AlarmEvent {
  eventId: string;
  equipIndex: number;
  equipId: string;
  bay: string;
  status: EquipStatus;
  temperature: number;
  timestamp: string;
}

export function createEquipmentGrid(count: number): EquipmentNode[] {
  const cols = Math.ceil(Math.sqrt(count));
  const spacing = 2.6;
  const offset = (cols * spacing) / 2;
  const nodes: EquipmentNode[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const aisleGap = Math.floor(row / 4) * 2.2;
    const bayNum = Math.floor(row / 4) + 1;
    const height = 1.2 + ((i * 37) % 10) * 0.14;

    nodes.push({
      index: i,
      id: `EQ-${String(bayNum).padStart(2, '0')}-${String(i + 1).padStart(4, '0')}`,
      bay: `BAY-${String(bayNum).padStart(2, '0')}`,
      x: col * spacing - offset,
      z: row * spacing + aisleGap - offset,
      height,
      temperature: 36 + ((i * 13) % 12),
      vibration: Number((0.4 + ((i * 7) % 10) * 0.08).toFixed(2)),
      status: 'NORMAL',
    });
  }
  return nodes;
}

export function stepTelemetry(
  nodes: EquipmentNode[],
  batchSize = 24
): { changedIndices: number[]; newAlarms: AlarmEvent[] } {
  const changedIndices: number[] = [];
  const newAlarms: AlarmEvent[] = [];
  const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });

  for (let k = 0; k < batchSize; k++) {
    const idx = Math.floor(Math.random() * nodes.length);
    const node = nodes[idx];
    const roll = Math.random();

    let nextStatus: EquipStatus = 'NORMAL';
    let nextTemp = 38 + Math.random() * 14;
    if (roll > 0.965) {
      nextStatus = 'ALARM';
      nextTemp = 82 + Math.random() * 16;
    } else if (roll > 0.89) {
      nextStatus = 'WARN';
      nextTemp = 65 + Math.random() * 14;
    }

    node.temperature = Number(nextTemp.toFixed(1));
    node.vibration = Number((0.3 + (nextStatus === 'ALARM' ? 2.1 : nextStatus === 'WARN' ? 1.1 : 0.4) * Math.random()).toFixed(2));
    if (node.status !== nextStatus) {
      node.status = nextStatus;
      changedIndices.push(idx);
      if (nextStatus === 'ALARM' || nextStatus === 'WARN') {
        newAlarms.push({
          eventId: `${node.id}-${Date.now()}-${k}`,
          equipIndex: idx,
          equipId: node.id,
          bay: node.bay,
          status: nextStatus,
          temperature: node.temperature,
          timestamp: now,
        });
      }
    }
  }
  return { changedIndices, newAlarms };
}
