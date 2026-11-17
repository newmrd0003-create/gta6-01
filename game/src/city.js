// SOLARA HEAT — city
// Costa Solara, built once from the seed: the ground, the street grid,
// pastel towers with lit windows, pavements and crossings, the beach and
// the sea with a marina pier and a lighthouse, palms, street furniture,
// the central plaza with its landmark tower, and the skyline past the
// playable edge. Same city on every load.
//
// The lit-window texture takes its dice as a parameter instead of reaching
// for the shared generator — the dependency stays explicit, so a shape
// change elsewhere can never silently break the boot.

import * as THREE from 'three';
import { GRID, PALETTE, worldRng, choose, between, streetLines } from './config.js';

// One 64x128 facade: pastel base, a grid of windows, about a third lit.
function facade(baseColor, r) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      g.fillStyle = r() < 0.35 ? '#ffd98a' : '#2c3a4a';
      g.fillRect(x, y, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const r = worldRng; // the seeded stream, shared so the city is fixed
  const solids = [];  // {x, z, hw, hd} axis-aligned boxes to bump into
  const towers = [];  // {x, z, w, d, h} for the minimap

  // --- light: warm low sun and a soft sky fill --------------------------
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(180, 220, -140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));
  scene.fog = new THREE.Fog(PALETTE.haze, 260, 720);
  scene.background = new THREE.Color(PALETTE.sky);

  // A flat box helper, so the builders below stay one-liners.
  const box = (w, h, d, mat, x, y, z, shadow) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    scene.add(m);
    return m;
  };
  const flat = (w, d, mat, x, y, z, shadow) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    if (shadow) m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // --- ground, beach, sea ------------------------------------------------
  flat(GRID.half * 2 + 120, GRID.half * 2 + 120,
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }), 0, 0, 0, true);
  flat(GRID.half * 2 + 120, 70,
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }), 0, 0.05, GRID.half + 20, true);
  flat(GRID.half * 2 + 400, 260,
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }), 0, -0.4, GRID.half + 185, false);

  // --- streets: dark strips, centre dashes, zebra crossings --------------
  const tarmac = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf0e0a0 });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  for (const v of streetLines()) {
    flat(GRID.half * 2, GRID.road, tarmac, 0, 0.08, v, true);
    flat(GRID.road, GRID.half * 2, tarmac, v, 0.08, 0, true);
    for (let p = -GRID.half + 15; p < GRID.half; p += 30) {
      const d1 = flat(4, 0.7, dashMat, p, 0.12, v, false);
      const d2 = flat(4, 0.7, dashMat, v, 0.12, p, false);
      d2.rotation.z = Math.PI / 2;
      void d1;
    }
    // Zebra stripes where the avenues meet the plaza streets.
    if (v === 0 || v === 60 || v === -60) {
      for (let s = -4; s <= 4; s += 2) {
        flat(1.1, 10, crossMat, v + s, 0.13, 0, false);
      }
    }
  }

  // --- pavements: pale slabs edging every block ---------------------------
  const paveMat = new THREE.MeshLambertMaterial({ color: PALETTE.walkway });
  for (let bx = -300; bx < 300; bx += GRID.step) {
    for (let bz = -300; bz < 300; bz += GRID.step) {
      flat(GRID.step - 4, GRID.step - 4, paveMat,
        bx + GRID.step / 2, 0.06, bz + GRID.step / 2, true);
    }
  }

  // --- towers: one to four per block ---------------------------------------
  const texByColor = new Map();
  const skinFor = (color) => {
    const key = color.toString(16);
    if (!texByColor.has(key)) {
      texByColor.set(key, facade('#' + key.padStart(6, '0'), r));
    }
    return texByColor.get(key);
  };
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a62 });
  // The plaza block (0,0) stays open for the landmark below.
  for (let bx = -300; bx < 300; bx += GRID.step) {
    for (let bz = -300; bz < 300; bz += GRID.step) {
      if (bx === 0 && bz === 0) continue;
      const cx = bx + GRID.step / 2;
      const cz = bz + GRID.step / 2;
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const w = between(r, 14, 24);
        const d = between(r, 14, 24);
        const h = between(r, 10, 46);
        const ox = (i % 2 === 0 ? -1 : 1) * between(r, 4, 10);
        const oz = (i < 2 ? -1 : 1) * between(r, 4, 10);
        const x = cx + ox;
        const z = cz + oz;
        const paint = choose(r, PALETTE.tower);
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ map: skinFor(paint) }));
        tower.position.set(x, h / 2, z);
        tower.castShadow = true;
        tower.receiveShadow = true;
        scene.add(tower);
        // A flat roof cap in a contrast shade.
        box(w + 0.6, 0.8, d + 0.6, roofMat, x, h + 0.4, z, false);
        solids.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
        towers.push({ x, z, w, d, h });
      }
    }
  }

  // --- central plaza: the Solara Tower, the city's landmark -----------------
  {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(26, 26, 0.3, 24),
      new THREE.MeshLambertMaterial({ color: 0xcfc4ae }));
    disc.position.set(30, 0.1, 30);
    disc.receiveShadow = true;
    scene.add(disc);
    const mark = new THREE.Mesh(
      new THREE.BoxGeometry(22, 88, 22),
      new THREE.MeshLambertMaterial({ map: skinFor(0x9fb8c8) }));
    mark.position.set(30, 44, 30);
    mark.castShadow = true;
    scene.add(mark);
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(13, 14, 4),
      new THREE.MeshLambertMaterial({ color: 0xffc030 }));
    crown.position.set(30, 95, 30);
    crown.rotation.y = Math.PI / 4;
    scene.add(crown);
    solids.push({ x: 30, z: 30, hw: 12, hd: 12 });
    towers.push({ x: 30, z: 30, w: 22, d: 22, h: 88 });
  }

  // --- marina pier and lighthouse, down on the beach -------------------------
  {
    box(10, 1, 60, new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
      -240, 0.5, GRID.half + 50, false);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 4.5, 22, 10),
      new THREE.MeshLambertMaterial({ color: 0xf0ead8 }));
    base.position.set(-252, 11, GRID.half + 76);
    base.castShadow = true;
    scene.add(base);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lamp.position.set(-252, 23, GRID.half + 76);
    scene.add(lamp);
  }

  // --- palms on the beach and down the main avenue ----------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4f });
  const palm = (x, z, s) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25 * s, 0.45 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 3.4 * s, 4), frondMat);
      leaf.position.set(Math.cos(a) * 1.4 * s, 7 * s, Math.sin(a) * 1.4 * s);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  };
  for (let x = -300; x <= 300; x += 30) {
    palm(x + between(r, -6, 6), 318 + between(r, -4, 4), between(r, 0.9, 1.3));
  }
  for (let z = -280; z <= 280; z += 90) {
    palm(-8, z, 1);
    palm(8, z + 40, 1);
  }

  // --- beach umbrellas: bright cones on the sand --------------------------------
  const shadeCols = [0xe05050, 0x50a0e0, 0xf0c030, 0x50c080];
  for (let i = 0; i < 12; i++) {
    const x = between(r, -280, 280);
    const z = GRID.half + between(r, 6, 26);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }));
    pole.position.set(x, 1.3, z);
    scene.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: choose(r, shadeCols) }));
    top.position.set(x, 2.9, z);
    top.castShadow = true;
    scene.add(top);
  }

  // --- street furniture: lamps along every avenue --------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let v = -300; v <= 300; v += GRID.step) {
    for (let p = -270; p <= 270; p += 60) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), poleMat);
      pole.position.set(p, 3, v + 8);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
      bulb.position.set(p, 6.1, v + 8);
      scene.add(bulb);
    }
  }

  // --- skyline: distant towers past the playable edge ------------------------------
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const dist = between(r, 380, 460);
    const h = between(r, 40, 110);
    const far = new THREE.Mesh(
      new THREE.BoxGeometry(between(r, 18, 30), h, between(r, 18, 30)),
      new THREE.MeshLambertMaterial({
        color: choose(r, PALETTE.tower), transparent: true, opacity: 0.85,
      }));
    far.position.set(Math.cos(a) * dist, h / 2 - 2, Math.sin(a) * dist);
    scene.add(far);
  }

  return {
    solids, towers, sun,
    // Shove a circle (x, z, radius) out of every tower it overlaps.
    // Two passes settle the corner cases where leaving one box lands
    // inside another.
    pushOut(x, z, radius) {
      let nx = x, nz = z;
      for (let pass = 0; pass < 2; pass++) {
        for (const c of solids) {
          const dx = nx - c.x, dz = nz - c.z;
          const px = c.hw + radius - Math.abs(dx);
          const pz = c.hd + radius - Math.abs(dz);
          if (px > 0 && pz > 0) {
            if (px < pz) nx = c.x + Math.sign(dx || 1) * (c.hw + radius);
            else nz = c.z + Math.sign(dz || 1) * (c.hd + radius);
          }
        }
      }
      return { x: nx, z: nz };
    },
  };
}
