---
name: aircoin-isometric-city
description: Build and optimize a polished interactive 2D isometric Delhi AIRcoin city in React and Phaser, with rooftop plant miners, traffic, AQI scenarios, and responsive browser performance. Use for city art, game scenes, interactions, and simulation integration.
---

# AIRcoin Isometric Delhi City

## Goal
Create a visually rich, smoothly animated 2D isometric Delhi-inspired city simulator for an AIRcoin hackathon demo. Preserve the existing React dashboard and its data contracts; replace only the city renderer as needed.

## Workflow
1. Inspect the repository, existing AIRcoin dashboard, API contracts, and current renderer before changing code.
2. Use React for HUD/dashboard and Phaser for the isometric game canvas. Confirm the installed Phaser version before using version-specific APIs.
3. Establish a consistent 2:1 isometric tile projection, tile dimensions, world coordinates, sprite anchor conventions, and object-depth ordering.
4. Implement a small playable neighborhood first: 12-20 distinct buildings, dense Delhi-style roads, metro, industrial area, schools, offices, residential blocks, and sparse ground-level trees.
5. Give each eligible building a visible rooftop with separate clickable plant-pot sprites and a miner marker. Keep buildings, roofs, plants, vehicles, roads, and haze as separate assets/layers.
6. Support drag-to-pan, scroll/pinch-to-zoom, hover selection, and click-to-open building dashboard. Clamp camera bounds and zoom.
7. Animate traffic using reusable sprites and pooled objects; keep background scenery largely static.
8. Connect city state to existing AQI scenario controls and miner telemetry. Show simulated readings and estimated PM2.5-equivalent removal, never imply citywide AQI changes are measured or caused directly by a few rooftop plants.
9. Implement explicit visual modes: polluted Delhi and AIRcoin deployment. Show progress through rooftop planting, verified work, and rewards.
10. Verify asset loading, scene lifecycle cleanup, responsiveness, error handling, and production build before completion.

## Art direction
- Rich 2D isometric illustrated/pixel-art style, not plain geometric boxes.
- Consistent perspective, scale, outlines, shadow direction, palette, and pixel density across all sprites.
- Architectural details: balconies, parapets, water tanks, AC units, rooftop pots, windows, signs, industrial chimneys, and elevated metro.
- Favor authentic Delhi-inspired architectural cues without pretending the fictional map is geographically exact.
- Generate or source separately licensed sprites/atlases; never use one flattened illustration as the entire interactive world.

## Performance
- Target smooth 60 FPS on a typical desktop; test rather than guarantee.
- Use sprite atlases, texture reuse, camera culling, pooling, and minimal per-frame allocations.
- Keep React state updates outside the frame loop; update HUD at a sensible cadence.
- Avoid per-sprite filters and expensive full-screen post-processing. Prefer a lightweight haze overlay.
- Lazy-load noncritical assets; support reduced motion and lower-end devices.
- Profile actual FPS, draw calls, memory, and load time in browser developer tools.

## Deliverables
- Working React + Phaser integration and responsive HUD.
- Isometric scene with clickable rooftops, animated traffic, and AQI scenario switching.
- Asset manifest with source/license and sprite dimensions.
- Local run/build commands and AWS S3/CloudFront deployment notes.
- Document mock vs live telemetry and any visual/scientific assumptions.
