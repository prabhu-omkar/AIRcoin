# AWS deployment — AIRcoin Delhi twin

The twin is a static Vite application. Phaser, React and the Web Worker compile into `dist/`; no
Node process is required in production. MQTT and C4 endpoint URLs remain runtime build variables.

## Production build

```bash
npm ci
npm run build
```

`npm run assets` is the artist pipeline, not a production prerequisite: its validated WebP atlas
and JSON map are checked in. Run it only after a source PNG changes, then commit both outputs.

Example production environment:

```text
VITE_MINER_ID=miner-001
VITE_MQTT_WS=wss://mqtt.example.com/mqtt
VITE_C4_URL=https://api.example.com
VITE_MINER_MODEL_URL=/models/aircoin-miner.glb
```

## S3 and CloudFront

1. Create a private S3 bucket and serve it only through CloudFront Origin Access Control.
2. Upload hashed files in `dist/assets/` with `Cache-Control: public,max-age=31536000,immutable`.
3. Upload `dist/index.html` with `Cache-Control: no-cache,max-age=0`.
4. Configure CloudFront custom error responses for 403 and 404 to `/index.html` with status 200.
5. Enable Brotli/Gzip compression, HTTP/2 or HTTP/3, and an ACM certificate for HTTPS.
6. Add a response-headers policy with a restrictive CSP. Allow only the HTTPS C4 host and WSS
   MQTT host in `connect-src`; allow the application's own assets in `img-src` and `worker-src`.

The shipped atlas is about 232 KiB and is fingerprinted by the Vite build. Phaser and the optional
3D miner viewer are separate lazy chunks, so the React HUD can paint before either engine loads.

## Performance acceptance

Test the CloudFront URL—not only localhost—on one typical laptop and one mobile device. Record FPS,
network transfer and memory from browser developer tools. The scene automatically reduces trees
and smoke after three consecutive readings below 48 FPS and restores them after sustained recovery.
It also honors `prefers-reduced-motion`.
