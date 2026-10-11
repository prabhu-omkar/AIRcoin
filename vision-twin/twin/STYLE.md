# AIRcoin Delhi — isometric art direction

This file is the single visual source of truth for every city asset and Phaser drawing routine.

## Projection and grid

- Projection: true 2:1 dimetric isometric.
- Logical tile: 128 × 64 px at 1× asset scale.
- Grid transform: `x = (col - row) × 64`, `y = (col + row) × 32`.
- Ground anchor: bottom-centre of an object's occupied front-most tile.
- Building footprints are declared before placement; a 2 × 2 building anchors at its front tile.
- Base asset density: 2× (256 × 128 source tile), displayed downsampled for crisp detail.

## Illustration style

- Polished editorial game illustration: crisp cel/painterly hybrid, not flat vector geometry and not chunky retro pixel art.
- Fine 1–2 px deep-navy outline at display scale, simplified readable silhouettes and small hand-painted material variation.
- Delhi-inspired rather than geographically exact: cream plaster, red sandstone, concrete balconies, blue-green glazing, rooftop water tanks, AC units, parapets, signs and plant pots.
- Texture remains subtle. Avoid photographic noise, hyper-realism, plastic 3D rendering and inconsistent outlines.
- Reference: `Delhi Aircoin City Before and After (2).png` supplied by the user; match its dense, warm, illustrated city-game mood without copying its text or exact composition.

## Light and shadow

- One fixed sun from upper-right / north-east.
- Roof and upper-right faces are warm highlights; left-facing walls are 18–25% darker.
- Soft contact shadow projects lower-left and never changes direction.
- Ambient haze is a separate runtime overlay, never baked into individual sprites.

## Locked palette

| Role | Hex |
|---|---|
| Ink / UI navy | `#09243B` |
| Deep shadow | `#243847` |
| Concrete shadow | `#667985` |
| Cream plaster | `#E9C99A` |
| Warm sandstone | `#C47755` |
| Sunlit ochre | `#E9A94F` |
| Window blue | `#5FA7BD` |
| Road asphalt | `#313D48` |
| Leaf dark | `#26734A` |
| Leaf bright | `#65C86F` |
| AIRcoin lime | `#9AF06D` |
| Pollution coral | `#E65A4F` |

Small value variations of these swatches are allowed for anti-aliasing; new hue families are not.

## Asset rules

- Transparent PNG/WebP, one isolated building or prop per source image.
- No labels, UI, captions, people, sky or background scenery inside an asset.
- Building source canvas: 768 × 768 minimum; prop source canvas: 512 × 512 minimum.
- Every source prompt must reference this `STYLE.md` and repeat the projection, light direction, palette and transparent-background constraint.
- Runtime dimensions, footprints, anchors and licensing/source are recorded in `src/phaser/assets/manifest.ts`.

## Initial consistency gate

The first three test assets are:

1. a 3 × 3 Delhi residential block with balconies, water tank and rooftop garden;
2. a 3 × 3 blue-glass Delhi office with solar panels and parapet;
3. a single neem street tree with bottom-centre ground anchor.

They must share the same projection, sun direction, outline, material treatment and apparent scale before the city expands.
