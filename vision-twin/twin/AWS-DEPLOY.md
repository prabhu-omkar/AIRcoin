# AWS Deployment - AIRcoin 3D Living Miner Digital Twin

The digital twin is a static Vite application built with React, Three.js, and React Three Fiber. Assets compile into `dist/`; no Node server process is required in production.

---

## 1. Production Build

```bash
cd vision-twin/twin
npm ci
npm run build
```

Production build output is generated in `vision-twin/twin/dist/`.

### Environment Configuration (`.env.production`)

```ini
VITE_MINER_ID=miner-001
VITE_MQTT_WS=wss://api.aircoin.eco/mqtt
VITE_C4_URL=https://api.aircoin.eco
VITE_MINER_MODEL_URL=/models/aircoin-miner.glb
```

---

## 2. Amazon S3 and CloudFront Setup

1. **Private S3 Bucket**: Create an S3 bucket with public access blocked, configured for Origin Access Control (OAC).
2. **Immutable Static Cache**: Upload hashed chunks in `dist/assets/` with `Cache-Control: public,max-age=31536000,immutable`.
3. **HTML No-Cache**: Upload `dist/index.html` with `Cache-Control: no-cache,max-age=0` so updates propagate immediately upon CloudFront invalidation.
4. **SPA Client Routing**: Configure CloudFront custom error responses: return `/index.html` with HTTP 200 for 403 and 404 response codes.
5. **Transport Security & Compression**: Enforce HTTPS via ACM SSL certificate, enable HTTP/2 and HTTP/3, and turn on Brotli and Gzip compression.
6. **Content Security Policy (CSP)**:
   - `connect-src 'self' wss://api.aircoin.eco/mqtt https://api.aircoin.eco https://rpc-amoy.polygon.technology;`
   - `img-src 'self' data: blob:;`
   - `script-src 'self' 'unsafe-eval';`
   - `style-src 'self' 'unsafe-inline';`

---

## 3. Automated Deployment Script

Deploy using the automated frontend deployment script:

```bash
export AWS_REGION=ap-south-1
export TWIN_BUCKET=aircoin-twin-portal
export TWIN_CF_DIST=E1234567890EXAMPLE

bash infra/aws/deploy-s3-frontends.sh
```

---

## 4. Performance and Quality Acceptance

1. **Target Frame Rate**: Consistent 60 FPS on desktop and laptop browsers during 3D camera pan, zoom, orbit, and exploded view transitions.
2. **Interaction Verification**:
   - Hovering over the PM2.5 monitoring device displays the "click to explode" message in the HUD hint bar.
   - Clicking the PM2.5 monitoring device explodes the IP65 enclosure to reveal the Raspberry Pi, PMS5003 sensor, and internal modules.
   - Camera PiP toggle for Lens / NDVI displays crisp text with high contrast in both unselected and selected states.
   - Owner Dashboard loads seamlessly via the top navigation rail without obscuring 3D background elements.
