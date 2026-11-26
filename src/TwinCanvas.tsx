import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { EquipmentNode, EquipStatus } from './sensorStream';

export interface RenderMetrics {
  fps: number;
  drawCalls: number;
  triangles: number;
}

interface TwinCanvasProps {
  nodes: EquipmentNode[];
  useInstancing: boolean;
  revision: number;
  focusIndex: number | null;
  onSelectNode: (node: EquipmentNode) => void;
  onMetrics: (metrics: RenderMetrics) => void;
}

const STATUS_COLOR: Record<EquipStatus, THREE.Color> = {
  NORMAL: new THREE.Color('#38bdf8'),
  WARN: new THREE.Color('#f59e0b'),
  ALARM: new THREE.Color('#ef4444'),
};

export function TwinCanvas({
  nodes,
  useInstancing,
  revision,
  focusIndex,
  onSelectNode,
  onMetrics,
}: TwinCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instancedRef = useRef<THREE.InstancedMesh | null>(null);
  const standardMeshesRef = useRef<THREE.Mesh[]>([]);
  const cameraTargetRef = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020617');
    scene.fog = new THREE.FogExp2('#020617', 0.0065);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      500
    );
    camera.position.set(45, 42, 55);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;

    scene.add(new THREE.AmbientLight('#cbd5e1', 0.8));
    const dirLight = new THREE.DirectionalLight('#ffffff', 1.2);
    dirLight.position.set(40, 80, 40);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(180, 60, '#1e293b', '#0f172a');
    scene.add(grid);

    const geometry = new THREE.BoxGeometry(1.5, 1, 1.5);
    const dummy = new THREE.Object3D();

    instancedRef.current = null;
    standardMeshesRef.current = [];

    if (useInstancing) {
      const material = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 });
      const instanced = new THREE.InstancedMesh(geometry, material, nodes.length);
      nodes.forEach((n, idx) => {
        dummy.position.set(n.x, n.height / 2, n.z);
        dummy.scale.set(1, n.height, 1);
        dummy.updateMatrix();
        instanced.setMatrixAt(idx, dummy.matrix);
        instanced.setColorAt(idx, STATUS_COLOR[n.status]);
      });
      instanced.instanceMatrix.needsUpdate = true;
      if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
      scene.add(instanced);
      instancedRef.current = instanced;
    } else {
      const meshes: THREE.Mesh[] = [];
      nodes.forEach((n) => {
        const mat = new THREE.MeshStandardMaterial({
          color: STATUS_COLOR[n.status],
          roughness: 0.35,
          metalness: 0.3,
        });
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(n.x, n.height / 2, n.z);
        mesh.scale.set(1, n.height, 1);
        mesh.userData.equipIndex = n.index;
        scene.add(mesh);
        meshes.push(mesh);
      });
      standardMeshesRef.current = meshes;
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      if (instancedRef.current) {
        const hits = raycaster.intersectObject(instancedRef.current);
        if (hits.length > 0 && hits[0].instanceId !== undefined) {
          onSelectNode(nodesRef.current[hits[0].instanceId]);
        }
      } else {
        const hits = raycaster.intersectObjects(standardMeshesRef.current);
        if (hits.length > 0) {
          const idx = hits[0].object.userData.equipIndex as number;
          onSelectNode(nodesRef.current[idx]);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let animId = 0;
    let frames = 0;
    let lastTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (cameraTargetRef.current) {
        camera.position.lerp(cameraTargetRef.current.pos, 0.08);
        controls.target.lerp(cameraTargetRef.current.look, 0.08);
        if (camera.position.distanceTo(cameraTargetRef.current.pos) < 0.3) {
          cameraTargetRef.current = null;
        }
      }
      controls.update();
      renderer.render(scene, camera);

      frames++;
      const now = performance.now();
      if (now - lastTime >= 500) {
        const fps = Math.round((frames * 1000) / (now - lastTime));
        onMetrics({
          fps,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
        });
        frames = 0;
        lastTime = now;
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.dispose();
      geometry.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [nodes.length, useInstancing]);

  // Sync updated colors without rebuilding scene
  useEffect(() => {
    if (instancedRef.current) {
      nodes.forEach((n, idx) => {
        instancedRef.current!.setColorAt(idx, STATUS_COLOR[n.status]);
      });
      if (instancedRef.current.instanceColor) {
        instancedRef.current.instanceColor.needsUpdate = true;
      }
    } else if (standardMeshesRef.current.length === nodes.length) {
      nodes.forEach((n, idx) => {
        const mat = standardMeshesRef.current[idx].material as THREE.MeshStandardMaterial;
        mat.color.copy(STATUS_COLOR[n.status]);
      });
    }
  }, [revision, nodes]);

  // Smooth camera focus on selected alarm/equipment
  useEffect(() => {
    if (focusIndex === null || !nodes[focusIndex]) return;
    const n = nodes[focusIndex];
    cameraTargetRef.current = {
      pos: new THREE.Vector3(n.x + 10, n.height + 10, n.z + 12),
      look: new THREE.Vector3(n.x, n.height / 2, n.z),
    };
  }, [focusIndex, nodes]);

  return <div ref={containerRef} className="canvas-host" />;
}
