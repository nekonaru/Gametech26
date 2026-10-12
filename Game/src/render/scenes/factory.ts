/**
 * Bagian "factory" dari scenes.ts — dipecah agar mudah dinavigasi.
 * Konsumen mengimpor semuanya lewat barrel src/render/scenes.ts.
 */
import * as THREE from 'three';
import { BuiltScene, Kit, palette, floor, wall, lampAt } from './kit.js';
import { resetFigures, resetDynamics } from './dynamics.js';
import { builders } from './builders.js';

export class SceneFactory {
  build(sceneId: string): BuiltScene {
    // Registri figur scene lama ikut dibuang: figur yang tidak lagi ada di
    // scene baru tak boleh terus dianimasikan oleh updateFigures tiap frame.
    // Tick dinamis (pintu bergerak, awan, burung) dibuang demi alasan sama:
    // mesh scene lama sudah dibongkar.
    resetFigures();
    resetDynamics();
    const kit: Kit = { group: new THREE.Group(), colliders: [], anchors: {}, doors: [] };
    const builder = builders[sceneId];

    if (builder) {
      builder(kit);
    } else {
      floor(kit, 14, 12, palette.floorWood);
      wall(kit, 14, 3, 0.2, 0, -6);
      wall(kit, 14, 3, 0.2, 0, 6);
      wall(kit, 0.2, 3, 12, -7, 0);
      wall(kit, 0.2, 3, 12, 7, 0);
      lampAt(kit, 0, 2.6, 0);
      console.warn(`SceneFactory: unknown scene "${sceneId}", using fallback room`);
    }

    // Prop statis: matriks lokal disusun sekali lalu dibekukan, karena
    // ratusan mesh per scene tidak perlu menyusun ulang matriks sendiri
    // tiap frame (hemat CPU, terasa di perangkat kelas menengah). Grup tetap
    // bebas bergerak; mesh yang sendiri dianimasikan di tempat (kepala/lengan
    // figur, tirai, awan, burung, prop yang diambil) ditandai `animatedLocal`
    // sehingga dilewati. Mesh beku di bawah grup bergerak tetap mengikuti
    // dengan benar: matriks dunia dihitung ulang oleh induk, sementara
    // matriks lokalnya hanya sekali.
    kit.group.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData.animatedLocal) return;
      let p: THREE.Object3D | null = obj.parent;
      while (p && p !== kit.group) {
        if (p.userData.animatedLocal) return;
        p = p.parent;
      }
      obj.updateMatrix();
      obj.matrixAutoUpdate = false;
    });

    return {
      group: kit.group,
      colliders: kit.colliders,
      spawn: { pos: [0, 0, 0], yaw: 0 },
      anchors: kit.anchors,
      doors: kit.doors
    };
  }
}

export const sceneFactory = new SceneFactory();
