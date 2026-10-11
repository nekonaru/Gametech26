import * as THREE from 'three';

/**
 * Vertex snapping ala PS1.
 *
 * Konsol generasi PS1 tidak punya perspektif koreksi tekstur dan menghitung
 * posisi verteks dalam presisi tetap, sehingga verteks "melompat" di kisi
 * resolusi render: siluet yang bergetar inilah yang paling mudah dikenali
 * sebagai rasa PS1. Efeknya ditambahkan tepat setelah `#include
 * <project_vertex>`: posisi klip dibulatkan ke kisi NDC sebelum dikalikan
 * kedalaman.
 *
 * Semua material berbagi satu setelan dari layar Pengaturan. Registry dipakai
 * alih-alih objek uniform bersama supaya pembaruan nilai tetap sampai ke
 * material yang dikompilasi ulang (misal setelah ganti babak).
 */
const uniforms = new Map<THREE.Material, { value: number }>();

/** NDC snap saat ini. 0 = mematikan snapping. */
let currentSnap = 0;

const SNAP_GLSL = /* glsl */ `
if (uSnap > 0.0) {
  float snapW = gl_Position.w;
  vec3 snapNdc = gl_Position.xyz / snapW;
  snapNdc.xy = floor(snapNdc.xy * uSnap + 0.5) / uSnap;
  gl_Position.xyz = snapNdc * snapW;
}
`;

/**
 * Pasang snapping pada material. Aman dipanggil berulang: material yang sama
 * hanya didaftarkan sekali.
 */
export function applyVertexSnap(material: THREE.Material): void {
  if (uniforms.has(material)) return;
  const uniform = { value: currentSnap };
  uniforms.set(material, uniform);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = uniform;
    shader.vertexShader = `uniform float uSnap;\n${shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>\n${SNAP_GLSL}`
    )}`;
  };
  // Kunci program khusus supaya material snapping tidak berbagi program dengan
  // material biasa yang kebetulan memakai shader yang sama.
  material.customProgramCacheKey = () => 'vertex-snap';
  material.needsUpdate = true;
}

/**
 * Terapkan nilai "Vertex Jitter" dari pengaturan.
 *
 * `jitter` makin besar = kisi makin kasar = makin terasa. Nilai 0,3 (preset
 * sedang) menghasilkan kisi ±200 sepanjang layar: terlihat jelas pada gerakan
 * kamera tapi tidak membuat tekstur bergetar tak karuan.
 */
export function setVertexJitterAmount(jitter: number): void {
  const amount = Number.isFinite(jitter) ? Math.max(0, jitter) : 0;
  currentSnap = amount > 0.001
    ? THREE.MathUtils.clamp(Math.round(60 / amount), 48, 1200)
    : 0;
  uniforms.forEach(u => { u.value = currentSnap; });
}

/** Lupakan semua material (dipanggil saat render dibuang agar tidak bocor). */
export function clearVertexSnaps(): void {
  uniforms.clear();
}

export function getTrackedSnapMaterials(): number {
  return uniforms.size;
}
