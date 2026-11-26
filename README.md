# realtime-3d-twin

[![Deploy to GitHub Pages](https://github.com/duduri97/realtime-3d-twin/actions/workflows/deploy.yml/badge.svg)](https://github.com/duduri97/realtime-3d-twin/actions/workflows/deploy.yml)

**라이브 데모**: https://duduri97.github.io/realtime-3d-twin/

**OpenLayers 2D 이미지 지도(GeoServer WMS) + Three.js `InstancedMesh` 3D 디지털 트윈 통합 관제 뷰어**입니다.  
단독 시뮬레이션(**Standalone**)은 물론, 로컬 백엔드 2종 및 GeoServer와 자동으로 연결되는 **Dual-Mode 아키텍처**로 설계되었습니다.

## 주요 기능

1. **2D WMS 지도 · 3D 트윈 분할 연동 (`SPLIT` / `2D` / `3D` 뷰 전환)**
   - **2D 이미지 지도 (OpenLayers + GeoServer WMS)**:
     - WMS 소스 전환 지원: `Built-in WMS (:8080/geoserver/spatial/wms)` · `Docker GeoServer (:8600/geoserver/spatial/wms)` · `Offline 래스터 시뮬레이터`
     - 기본 GIS 기능: 배경지도 전환(Dark 관제 / OSM), WMS 이미지 레이어 ON/OFF 및 투명도 슬라이더, 센서 피처 토글, **거리 측정(`LineString`)**, 초기 영역 이동, 마우스 실시간 경위도·줌 HUD
   - **2D ↔ 3D 양방향 포커싱 동기화**: 2D 지도 피처나 실시간 알람을 클릭하면 2D 지도 중심 이동과 3D 카메라 포커싱이 동시에 동작합니다.
2. **대규모 3D 최적화 (`InstancedMesh`)**
   - 2,500대 가상 설비를 1회의 Draw Call로 렌더링하며 `Individual Mesh` 모드와 실시간 FPS·Draw Call 비교가 가능합니다.
3. **3-Repo 크로스 서비스 연동**
   - `spatial-openapi-sdk (:8080)`: 선택 설비 `EPSG:4326 → EPSG:5179(UTM-K)` 좌표 변환, 내장 WMS 이미지 타일 제공, OpenAPI 롤업 로그 절감률 조회
   - `sql-tuning-lab (:8081)`: 선택 설비 대용량 이력 `Full Scan vs Composite Index` 응답시간 비교 및 비관적/낙관적 락 8건 동시 알람 ACK

## 빠른 실행

```bash
npm install
npm run dev
```
