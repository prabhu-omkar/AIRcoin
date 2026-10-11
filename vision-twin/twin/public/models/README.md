# Miner model drop-in

Place Omkar's optimized export here as `aircoin-miner.glb`, then copy `.env.example` to `.env`.

Recommended export settings:

- glTF Binary (`.glb`), transforms applied, origin centred at the rig base;
- Draco or Meshopt geometry compression and WebP/KTX2 textures;
- shared materials, textures at 1K or 2K, and no embedded lights;
- under 100k rendered triangles for the inspection view;
- under 8 MB compressed for fast local/demo loading.

The city remains functional when the file is absent by using the procedural miner fallback.
