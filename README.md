# realtime-3d-twin

Three.js **`InstancedMesh` 기반 대규모 3D 디지털 트윈 렌더링 최적화 + 실시간 센서 알람 뷰어** 데모입니다.  
수천 대의 가상 설비 노드를 1회의 Draw Call로 렌더링하면서 실시간 센서 상태(정상/주의/알람)를 색상으로 시각화하고, 알람 클릭 시 해당 설비로 카메라가 부드럽게 포커싱됩니다.

## 핵심 구현 포인트

1. **InstancedMesh vs Individual Mesh 실시간 성능 비교**
   - 좌측 HUD에서 `InstancedMesh (1 Draw Call)`과 `Individual Mesh (N Draw Calls)`를 전환하며 **FPS와 Draw Call 차이**를 즉시 확인할 수 있습니다.
2. **실시간 가상 센서 스트림 & 알람 포커싱**
   - 600ms 주기로 설비 온도·진동 텔레메트리가 갱신되며, 임계치 초과 시 3D 오브젝트 색상이 즉시 변경되고 알람 피드에 기록됩니다.
   - 알람 항목 또는 3D 설비를 클릭하면 `Raycaster` + 선형 보간(`lerp`)으로 카메라가 해당 설비에 포커싱됩니다.
3. **GitHub Pages 정적 배포 지원**
   - `.github/workflows/deploy.yml`을 통해 `main` 푸시 시 자동으로 GitHub Pages 라이브 데모가 배포됩니다.

## 빠른 실행

```bash
npm install
npm run dev
```

프로덕션 빌드:

```bash
npm run build
```
