# Changelog

All notable changes to `realtime-3d-twin` will be documented in this file.

## [1.0.0] - 2026-11-26

### Added
- Three.js `InstancedMesh` 3D digital twin renderer supporting up to 2,500 virtual equipment nodes in 1 draw call, with live FPS/Draw Call comparison against individual meshes.
- OpenLayers 2D GIS image map (`Map2DPanel`) supporting Built-in OGC WMS (`:8080`), Docker GeoServer WMS (`:8600`), and standalone Canvas WMS simulation, plus layer opacity, base map switching, and `LineString` distance measurement.
- `SPLIT` (2D WMS + 3D Twin), `3D`, and `2D` view switcher with bidirectional click/alarm camera focusing.
- Dual-Mode ecosystem client (`ecosystemClient.ts`) auto-connecting to `spatial-openapi-sdk` (`EPSG:5179` transform & rollup metrics) and `sql-tuning-lab` (index speedup & 8-way concurrent alarm ACK).
- GitHub Actions automated deployment to GitHub Pages with concurrency protection.
