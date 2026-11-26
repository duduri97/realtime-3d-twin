import { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import VectorLayer from 'ol/layer/Vector';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import ImageWMS from 'ol/source/ImageWMS';
import ImageCanvasSource from 'ol/source/ImageCanvas';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Draw from 'ol/interaction/Draw';
import { fromLonLat, toLonLat } from 'ol/proj';
import { getLength } from 'ol/sphere';
import { Circle as CircleStyle, Fill, Stroke, Style, Text as TextStyle } from 'ol/style';
import type { EquipmentNode } from './sensorStream';
import { gridToWgs84 } from './ecosystemClient';

export type WmsMode = 'AUTO_8080' | 'GEOSERVER_8600' | 'OFFLINE_CANVAS';

interface Map2DPanelProps {
  nodes: EquipmentNode[];
  revision: number;
  selected: EquipmentNode | null;
  spatialOnline: boolean;
  onSelectNode: (node: EquipmentNode) => void;
}

const SEOUL_ANCHOR: [number, number] = [126.978, 37.5665];

const FALLBACK_FACILITIES = [
  { name: 'Seoul City Hall', layer: 'LANDMARK', lon: 126.978, lat: 37.5665 },
  { name: 'Gwanghwamun Gate', layer: 'LANDMARK', lon: 126.9769, lat: 37.5759 },
  { name: 'Seoul Station', layer: 'TRANSIT', lon: 126.9707, lat: 37.5547 },
  { name: 'N Seoul Tower', layer: 'LANDMARK', lon: 126.9882, lat: 37.5512 },
  { name: 'AQ-Station-Jongno', layer: 'SENSOR', lon: 126.983, lat: 37.572 },
];

export function Map2DPanel({
  nodes,
  revision,
  selected,
  spatialOnline,
  onSelectNode,
}: Map2DPanelProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const baseOsmRef = useRef<TileLayer<OSM> | null>(null);
  const baseDarkRef = useRef<TileLayer<XYZ> | null>(null);
  const wmsLayerRef = useRef<ImageLayer<ImageWMS | ImageCanvasSource> | null>(null);
  const equipSourceRef = useRef<VectorSource>(new VectorSource());
  const measureSourceRef = useRef<VectorSource>(new VectorSource());
  const drawRef = useRef<Draw | null>(null);

  const [baseStyle, setBaseStyle] = useState<'DARK' | 'OSM'>('DARK');
  const [wmsMode, setWmsMode] = useState<WmsMode>(spatialOnline ? 'AUTO_8080' : 'OFFLINE_CANVAS');
  const [wmsVisible, setWmsVisible] = useState(true);
  const [equipVisible, setEquipVisible] = useState(true);
  const [wmsOpacity, setWmsOpacity] = useState(0.85);
  const [measuring, setMeasuring] = useState(false);
  const [measuredText, setMeasuredText] = useState<string>('');
  const [cursorCoord, setCursorCoord] = useState<string>('126.97800, 37.56650');
  const [zoomLevel, setZoomLevel] = useState<number>(15);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    if (spatialOnline && wmsMode === 'OFFLINE_CANVAS') {
      setWmsMode('AUTO_8080');
    }
  }, [spatialOnline]);

  // Initialize OpenLayers 2D Map
  useEffect(() => {
    if (!mapElRef.current) return;

    const osmLayer = new TileLayer({
      source: new OSM(),
      visible: false,
    });

    const darkLayer = new TileLayer({
      source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        attributions: '&copy; OpenStreetMap &copy; CARTO',
      }),
      visible: true,
    });

    const wmsLayer = new ImageLayer({
      source: createWmsSource(wmsMode),
      opacity: wmsOpacity,
      visible: wmsVisible,
    });

    const equipLayer = new VectorLayer({
      source: equipSourceRef.current,
      style: (feat) => {
        const st = feat.get('status') as string;
        const isSelected = Boolean(feat.get('selected'));
        const color = st === 'ALARM' ? '#ef4444' : st === 'WARN' ? '#f59e0b' : '#38bdf8';
        return new Style({
          image: new CircleStyle({
            radius: isSelected ? 8 : st === 'NORMAL' ? 4 : 6,
            fill: new Fill({ color }),
            stroke: new Stroke({ color: isSelected ? '#ffffff' : '#0f172a', width: isSelected ? 2.5 : 1.2 }),
          }),
        });
      },
    });

    const measureLayer = new VectorLayer({
      source: measureSourceRef.current,
      style: new Style({
        stroke: new Stroke({ color: '#34d399', width: 2.5, lineDash: [6, 4] }),
      }),
    });

    const map = new Map({
      target: mapElRef.current,
      layers: [darkLayer, osmLayer, wmsLayer, equipLayer, measureLayer],
      view: new View({
        center: fromLonLat(SEOUL_ANCHOR),
        zoom: 15,
      }),
    });

    map.on('pointermove', (evt) => {
      const [lon, lat] = toLonLat(evt.coordinate);
      setCursorCoord(`${lon.toFixed(5)}, ${lat.toFixed(5)}`);
    });

    map.getView().on('change:resolution', () => {
      setZoomLevel(Math.round((map.getView().getZoom() || 15) * 10) / 10);
    });

    map.on('singleclick', (evt) => {
      if (drawRef.current) return;
      map.forEachFeatureAtPixel(evt.pixel, (feat) => {
        const idx = feat.get('equipIndex');
        if (typeof idx === 'number' && nodesRef.current[idx]) {
          onSelectNode(nodesRef.current[idx]);
          return true;
        }
        return false;
      });
    });

    baseOsmRef.current = osmLayer;
    baseDarkRef.current = darkLayer;
    wmsLayerRef.current = wmsLayer;
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.updateSize());
    resizeObserver.observe(mapElRef.current);

    return () => {
      resizeObserver.disconnect();
      map.setTarget(undefined);
    };
  }, []);

  // Switch Base Map
  useEffect(() => {
    baseDarkRef.current?.setVisible(baseStyle === 'DARK');
    baseOsmRef.current?.setVisible(baseStyle === 'OSM');
  }, [baseStyle]);

  // Switch GeoServer WMS Source / Visibility / Opacity
  useEffect(() => {
    if (!wmsLayerRef.current) return;
    wmsLayerRef.current.setSource(createWmsSource(wmsMode));
  }, [wmsMode]);

  useEffect(() => {
    wmsLayerRef.current?.setVisible(wmsVisible);
  }, [wmsVisible]);

  useEffect(() => {
    wmsLayerRef.current?.setOpacity(wmsOpacity);
  }, [wmsOpacity]);

  // Sync Equipment Sensor Points onto 2D Map (sampled + all WARN/ALARM + selected for fast 2D rendering)
  useEffect(() => {
    const src = equipSourceRef.current;
    src.clear();
    if (!equipVisible) return;

    const stride = nodes.length > 800 ? 4 : 2;
    const feats: Feature[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const isSelected = selected?.index === n.index;
      if (n.status === 'NORMAL' && !isSelected && i % stride !== 0) continue;

      const [lon, lat] = gridToWgs84(n.x, n.z);
      const f = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
        equipIndex: n.index,
        status: n.status,
        selected: isSelected,
      });
      if (isSelected) {
        f.setStyle(
          new Style({
            image: new CircleStyle({
              radius: 9,
              fill: new Fill({ color: '#38bdf8' }),
              stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
            }),
            text: new TextStyle({
              text: `${n.id} (${n.temperature}°C)`,
              offsetY: -16,
              fill: new Fill({ color: '#f8fafc' }),
              stroke: new Stroke({ color: '#020617', width: 3 }),
              font: '600 12px sans-serif',
            }),
          })
        );
      }
      feats.push(f);
    }
    src.addFeatures(feats);
  }, [nodes, revision, selected, equipVisible]);

  // Pan 2D map when a node is selected from 3D or Alarm list
  useEffect(() => {
    if (!selected || !mapRef.current) return;
    const [lon, lat] = gridToWgs84(selected.x, selected.z);
    mapRef.current.getView().animate({
      center: fromLonLat([lon, lat]),
      duration: 350,
    });
  }, [selected]);

  // Distance measurement tool
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (drawRef.current) {
      map.removeInteraction(drawRef.current);
      drawRef.current = null;
    }

    if (measuring) {
      const draw = new Draw({
        source: measureSourceRef.current,
        type: 'LineString',
      });
      draw.on('drawend', (evt) => {
        const geom = evt.feature.getGeometry() as LineString;
        const meters = getLength(geom);
        setMeasuredText(
          meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
        );
      });
      map.addInteraction(draw);
      drawRef.current = draw;
    }
  }, [measuring]);

  const resetExtent = () => {
    mapRef.current?.getView().animate({
      center: fromLonLat(SEOUL_ANCHOR),
      zoom: 15,
      duration: 350,
    });
  };

  const clearMeasure = () => {
    measureSourceRef.current.clear();
    setMeasuredText('');
    setMeasuring(false);
  };

  return (
    <div className="map2d-wrap">
      <div className="map2d-toolbar">
        <select value={baseStyle} onChange={(e) => setBaseStyle(e.target.value as 'DARK' | 'OSM')}>
          <option value="DARK">배경: Dark 관제지도</option>
          <option value="OSM">배경: OSM 일반지도</option>
        </select>

        <select value={wmsMode} onChange={(e) => setWmsMode(e.target.value as WmsMode)}>
          <option value="AUTO_8080">WMS: Built-in (:8080/geoserver/spatial/wms)</option>
          <option value="GEOSERVER_8600">WMS: Docker GeoServer (:8600/geoserver/spatial/wms)</option>
          <option value="OFFLINE_CANVAS">WMS: Offline 래스터 시뮬레이터</option>
        </select>

        <label className="chk">
          <input type="checkbox" checked={wmsVisible} onChange={(e) => setWmsVisible(e.target.checked)} />
          WMS 이미지 레이어
        </label>

        <label className="chk">
          투명도
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={wmsOpacity}
            onChange={(e) => setWmsOpacity(Number(e.target.value))}
          />
        </label>

        <label className="chk">
          <input type="checkbox" checked={equipVisible} onChange={(e) => setEquipVisible(e.target.checked)} />
          센서 피처
        </label>

        <button className="mini-btn" onClick={resetExtent}>초기 영역</button>
        <button
          className={`mini-btn ${measuring ? 'active-btn' : ''}`}
          onClick={() => setMeasuring((m) => !m)}
        >
          {measuring ? '거리측정 종료' : '거리 측정'}
        </button>
        {measuredText && (
          <button className="mini-btn" onClick={clearMeasure}>
            측정값: {measuredText} (초기화)
          </button>
        )}
      </div>

      <div ref={mapElRef} className="map2d-canvas" />

      <div className="map2d-hud">
        <span>CRS: EPSG:3857 (표시 EPSG:4326)</span>
        <span>좌표: {cursorCoord}</span>
        <span>Zoom: {zoomLevel}</span>
      </div>
    </div>
  );
}

function createWmsSource(mode: WmsMode): ImageWMS | ImageCanvasSource {
  if (mode === 'AUTO_8080') {
    return new ImageWMS({
      url: 'http://localhost:8080/geoserver/spatial/wms',
      params: {
        LAYERS: 'spatial:spatial_features',
        FORMAT: 'image/png',
        TRANSPARENT: true,
        VERSION: '1.3.0',
      },
      ratio: 1,
      crossOrigin: 'anonymous',
    });
  }

  if (mode === 'GEOSERVER_8600') {
    return new ImageWMS({
      url: 'http://localhost:8600/geoserver/spatial/wms',
      params: {
        LAYERS: 'spatial:spatial_features',
        FORMAT: 'image/png',
        TRANSPARENT: true,
        VERSION: '1.1.1',
      },
      ratio: 1,
      crossOrigin: 'anonymous',
    });
  }

  // Offline Canvas WMS simulator for GitHub Pages standalone preview
  return new ImageCanvasSource({
    canvasFunction: (extent, _resolution, pixelRatio, size) => {
      const canvas = document.createElement('canvas');
      canvas.width = size[0];
      canvas.height = size[1];
      const ctx = canvas.getContext('2d');
      if (!ctx) return canvas;

      const [minX, minY, maxX, maxY] = extent;
      const toPx = (lon: number, lat: number): [number, number] => {
        const [mx, my] = fromLonLat([lon, lat]);
        const px = ((mx - minX) / (maxX - minX)) * size[0];
        const py = ((maxY - my) / (maxY - minY)) * size[1];
        return [px, py];
      };

      // Draw WMS Cleanroom Sensor Zone polygon
      const [zx1, zy1] = toPx(126.971, 37.572);
      const [zx2, zy2] = toPx(126.985, 37.561);
      const rx = Math.min(zx1, zx2);
      const ry = Math.min(zy1, zy2);
      const rw = Math.abs(zx2 - zx1);
      const rh = Math.abs(zy2 - zy1);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = 1.6 * pixelRatio;
      ctx.setLineDash([6 * pixelRatio, 4 * pixelRatio]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);

      ctx.font = `bold ${Math.round(11 * pixelRatio)}px sans-serif`;
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('WMS LAYER — 3D TWIN SENSOR ZONE', rx + 8, ry + 16 * pixelRatio);

      for (const f of FALLBACK_FACILITIES) {
        const [px, py] = toPx(f.lon, f.lat);
        ctx.beginPath();
        ctx.arc(px, py, 10 * pixelRatio, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(52, 211, 153, 0.25)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, 5 * pixelRatio, 0, Math.PI * 2);
        ctx.fillStyle = f.layer === 'SENSOR' ? '#ef4444' : '#34d399';
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5 * pixelRatio;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.fillText(f.name, px + 8 * pixelRatio, py + 4 * pixelRatio);
      }
      return canvas;
    },
    ratio: 1,
  });
}
