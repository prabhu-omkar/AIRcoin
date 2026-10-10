// Shared materials and shader tweaks.
import * as THREE from "three";

/** One clock for every animated shader. Advanced once per frame by the main twin canvas. */
export const sharedTime = { value: 0 };

export interface PlantUniforms {
  uSat: { value: number }; // 1 = natural colour, 0 = grey (dead)
  uWind: { value: number }; // sway amount
  uTint: { value: THREE.Color }; // multiplied after desaturation
  uLive: { value: number }; // 1 = living tissue, 0 = plastic (no near-infrared response)
  uNdvi: { value: number }; // 1 = render as NDVI false colour (camera NDVI view)
}

/** Vertex-coloured leaf material with wind sway, health desaturation and an NDVI false-colour mode. */
export function makePlantMaterial(opts: { plastic?: boolean } = {}): THREE.MeshStandardMaterial & { userData: { u: PlantUniforms } } {
  const u: PlantUniforms = {
    uSat: { value: 1 },
    uWind: { value: opts.plastic ? 0.05 : 1 },
    uTint: { value: opts.plastic ? new THREE.Color(0.85, 1.3, 0.7) : new THREE.Color(1, 1, 1) },
    uLive: { value: opts.plastic ? 0 : 1 },
    uNdvi: { value: 0 },
  };
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: opts.plastic ? 0.22 : 0.62,
    metalness: 0,
    envMapIntensity: opts.plastic ? 1.3 : 0.7,
  });
  m.userData.u = u;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedTime;
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 wOrigin = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float h = max(position.y, 0.0);
        float ph = wOrigin.x * 0.9 + wOrigin.y * 0.4;
        float sw = sin(uTime * 1.25 + ph) * 0.6 + sin(uTime * 2.9 + position.x * 4.0 + ph) * 0.25 + sin(uTime * 6.1 + position.z * 9.0) * 0.08;
        transformed.x += sw * 0.035 * h * h * uWind;
        transformed.z += cos(uTime * 1.05 + ph * 1.3) * 0.022 * h * h * uWind;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uSat;\nuniform vec3 uTint;\nuniform float uLive;\nuniform float uNdvi;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, uSat) * uTint;`,
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        if (uNdvi > 0.5) {
          float green = clamp(vColor.g - 0.5 * (vColor.r + vColor.b) + 0.3, 0.0, 1.0);
          float v = clamp(uLive * uSat * (0.35 + 1.1 * green), 0.0, 1.0);
          vec3 c = v < 0.33 ? mix(vec3(0.05, 0.08, 0.45), vec3(0.0, 0.75, 0.6), v / 0.33)
                 : v < 0.66 ? mix(vec3(0.0, 0.75, 0.6), vec3(1.0, 0.9, 0.1), (v - 0.33) / 0.33)
                 : mix(vec3(1.0, 0.9, 0.1), vec3(1.0, 0.15, 0.05), (v - 0.66) / 0.34);
          float l = dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11));
          gl_FragColor.rgb = c * (0.6 + 0.8 * clamp(l * 2.5, 0.0, 1.0));
        }`,
      );
  };
  m.customProgramCacheKey = () => "aircoin-plant-v2";
  return m as THREE.MeshStandardMaterial & { userData: { u: PlantUniforms } };
}

export const STATUS_COLOR = {
  present: new THREE.Color("#a6d17e"),
  missing: new THREE.Color("#d9a441"),
  removed: new THREE.Color("#7a7f74"),
  suspect: new THREE.Color("#df6a4f"),
} as const;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
