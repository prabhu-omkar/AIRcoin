// Shared materials and shader tweaks.
import * as THREE from "three";

/** One clock for every animated shader. Advanced once per frame by the main twin canvas. */
export const sharedTime = { value: 0 };

export interface PlantUniforms {
  uSat: { value: number }; // 1 = natural colour, 0 = grey (dead)
  uWind: { value: number }; // sway amount
  uTint: { value: THREE.Color }; // multiplied after desaturation
}

/** Vertex-coloured leaf material with wind sway and health desaturation. */
export function makePlantMaterial(): THREE.MeshStandardMaterial & { userData: { u: PlantUniforms } } {
  const u: PlantUniforms = { uSat: { value: 1 }, uWind: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0, envMapIntensity: 0.7 });
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
      ;
  };
  m.customProgramCacheKey = () => "aircoin-plant-v3";
  return m as THREE.MeshStandardMaterial & { userData: { u: PlantUniforms } };
}

export const STATUS_COLOR = {
  present: new THREE.Color("#3fb950"),
  missing: new THREE.Color("#d29922"),
  removed: new THREE.Color("#6e7681"),
  suspect: new THREE.Color("#f85149"),
} as const;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** How polluted the air looks, 0 = clean, 1 = severe. Eased from the live AQI once per frame by Atmosphere. */
export const airState = { k: 0 };

/** Sky and haze palettes for clean air and for smog; everything atmospheric lerps between them. */
export const SKY = {
  zenithClean: new THREE.Color("#6f9fc4"),
  horizonClean: new THREE.Color("#f3dcb8"),
  zenithSmog: new THREE.Color("#8d8576"),
  horizonSmog: new THREE.Color("#d2b48a"),
  sunClean: new THREE.Color("#fff1d6"),
  sunSmog: new THREE.Color("#ff9a4d"),
};
