// SOLARA HEAT — city.js
// One job: build Costa Solara — the ground, road grid, pastel towers with
// lit windows, sidewalks and crosswalks, the beach and ocean with a marina
// pier and lighthouse, palms, street props, the central plaza with its
// landmark tower, and the collision boxes the player and cars bump into.
// Deterministic from the seed: the same city on every load.
//
// The lit-window texture takes its random source as a parameter instead of
// reaching for the shared generator — the old shape (a function called on a
// number) silently killed the whole boot once, so the dependency is explicit.

import * as THREE from 'three';
import { WORLD, PALETTE, rng, pick, rand, roadLines } from './config.js';

// One 64x128 facade: pastel base, a grid of windows, about a third lit.
function windowTexture(baseColor, r) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      const lit = r() < 0.35;
      g.fillStyle = lit ? '#ffd98a' : '#2c3a4a';
      g.fillRect(x, y, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene) {
  const r = rng; // the seeded generator, shared so the city is deterministic
  const colliders = [];   // {x, z, hw, hd} axis-aligned boxes
  const buildings = [];   // {x, z, w, d, h} for the minimap

  // --- lights: warm low sun + soft sky fill -------------------------------
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(180, 220, -140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 720);
  scene.background = new THREE.Color(PALETTE.sky);

  // --- ground, beach, ocean ------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 120, WORLD.half * 2 + 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 120, 70),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, WORLD.half + 20);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 400, 260),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, WORLD.half + 185);
  scene.add(sea);

  // --- roads: dark strips + centre dashes + crosswalks ---------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf0e0a0 });
  const walkMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  const lines = roadLines();
  for (const v of lines) {
    for (const [w, d, x, z] of [
      [WORLD.half * 2, WORLD.roadWidth, 0, v],
      [WORLD.roadWidth, WORLD.half * 2, v, 0],
    ]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.08, z);
      road.receiveShadow = true;
      scene.add(road);
    }
    // dashes along each road
    for (let p = -WORLD.half + 15; p < WORLD.half; p += 30) {
      for (const [x, z] of [[p, v], [v, p]]) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.7), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = x === p ? 0 : Math.PI / 2;
        dash.position.set(x, 0.12, z);
        scene.add(dash);
      }
    }
    // zebra crossings where the two avenues meet the plaza roads
    if (v === 0 || v === 60 || v === -60) {
      for (let s = -4; s <= 4; s += 2) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 10), walkMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(v + s, 0.13, 0);
        scene.add(stripe);
      }
    }
  }

  // --- sidewalks: pale strips edging every block ---------------------------
  const walkSideMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (let bx = -300; bx < 300; bx += WORLD.roadStep) {
    for (let bz = -300; bz < 300; bz += WORLD.roadStep) {
      const walk = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD.roadStep - 4, WORLD.roadStep - 4), walkSideMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(bx + WORLD.roadStep / 2, 0.06, bz + WORLD.roadStep / 2);
      walk.receiveShadow = true;
      scene.add(walk);
    }
  }

  // --- buildings: one to four towers per block ----------------------------
  const texCache = new Map();
  const getTex = (color) => {
    const key = color.toString(16);
    if (!texCache.has(key)) {
      texCache.set(key, windowTexture('#' + key.padStart(6, '0'), r));
    }
    return texCache.get(key);
  };
  // The plaza block (0,0) stays open for the landmark tower below.
  for (let bx = -300; bx < 300; bx += WORLD.roadStep) {
    for (let bz = -300; bz < 300; bz += WORLD.roadStep) {
      if (bx === 0 && bz === 0) continue;
      const cx = bx + WORLD.roadStep / 2;
      const cz = bz + WORLD.roadStep / 2;
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const w = rand(r, 14, 24);
        const d = rand(r, 14, 24);
        const h = rand(r, 10, 46);
        const ox = (i % 2 === 0 ? -1 : 1) * rand(r, 4, 10);
        const oz = (i < 2 ? -1 : 1) * rand(r, 4, 10);
        const x = cx + ox, z = cz + oz;
        const color = pick(r, PALETTE.building);
        const mat = new THREE.MeshLambertMaterial({ map: getTex(color) });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(x, h / 2, z);
        tower.castShadow = true;
        tower.receiveShadow = true;
        scene.add(tower);
        // flat roof cap in a contrast colour
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6),
          new THREE.MeshLambertMaterial({ color: 0x5a5a62 }),
        );
        roof.position.set(x, h + 0.4, z);
        scene.add(roof);
        colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
        buildings.push({ x, z, w, d, h });
      }
    }
  }

  // --- central plaza: the Solara Tower, the city's landmark ----------------
  {
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(26, 26, 0.3, 24),
      new THREE.MeshLambertMaterial({ color: 0xcfc4ae }),
    );
    plaza.position.set(30, 0.1, 30);
    plaza.receiveShadow = true;
    scene.add(plaza);
    const towerMat = new THREE.MeshLambertMaterial({ map: getTex(0x9fb8c8) });
    const landmark = new THREE.Mesh(new THREE.BoxGeometry(22, 88, 22), towerMat);
    landmark.position.set(30, 44, 30);
    landmark.castShadow = true;
    scene.add(landmark);
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(13, 14, 4),
      new THREE.MeshLambertMaterial({ color: 0xffc030 }),
    );
    crown.position.set(30, 95, 30);
    crown.rotation.y = Math.PI / 4;
    scene.add(crown);
    colliders.push({ x: 30, z: 30, hw: 12, hd: 12 });
    buildings.push({ x: 30, z: 30, w: 22, d: 22, h: 88 });
  }

  // --- marina pier + lighthouse at the beach --------------------------------
  {
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(10, 1, 60),
      new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
    );
    pier.position.set(-240, 0.5, WORLD.half + 50);
    scene.add(pier);
    const lightBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 4.5, 22, 10),
      new THREE.MeshLambertMaterial({ color: 0xf0ead8 }),
    );
    lightBase.position.set(-252, 11, WORLD.half + 76);
    lightBase.castShadow = true;
    scene.add(lightBase);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    lamp.position.set(-252, 23, WORLD.half + 76);
    scene.add(lamp);
  }

  // --- palms along the beach and the main avenue ---------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4f });
  function palm(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.45 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 3.4 * s, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.4 * s, 7 * s, Math.sin(a) * 1.4 * s);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let x = -300; x <= 300; x += 30) palm(x + rand(r, -6, 6), 318 + rand(r, -4, 4), rand(r, 0.9, 1.3));
  for (let z = -280; z <= 280; z += 90) {
    palm(-8, z, 1); palm(8, z + 40, 1);
  }

  // --- beach umbrellas: striped cones on the sand --------------------------
  const umbrellaCols = [0xe05050, 0x50a0e0, 0xf0c030, 0x50c080];
  for (let i = 0; i < 12; i++) {
    const x = rand(r, -280, 280);
    const z = WORLD.half + rand(r, 6, 26);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }),
    );
    pole.position.set(x, 1.3, z);
    scene.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: pick(r, umbrellaCols) }),
    );
    top.position.set(x, 2.9, z);
    top.castShadow = true;
    scene.add(top);
  }

  // --- street props: lamps, hydrants, benches ------------------------------
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let v = -300; v <= 300; v += WORLD.roadStep) {
    for (let p = -270; p <= 270; p += 60) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), lampMat);
      pole.position.set(p, 3, v + 8);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampGlow);
      bulb.position.set(p, 6.1, v + 8);
      scene.add(bulb);
    }
  }

  // --- skyline backdrop: distant towers beyond the playable edge -----------
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const dist = rand(r, 380, 460);
    const h = rand(r, 40, 110);
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(rand(r, 18, 30), h, rand(r, 18, 30)),
      new THREE.MeshLambertMaterial({ color: pick(r, PALETTE.building), transparent: true, opacity: 0.85 }),
    );
    tower.position.set(Math.cos(a) * dist, h / 2 - 2, Math.sin(a) * dist);
    scene.add(tower);
  }

  return {
    colliders, buildings, sun,
    // Push a circle (x, z, radius) out of every building it overlaps.
    // Runs over colliders in order; a second pass settles corner cases
    // where pushing out of one box lands inside another.
    resolveCircle(x, z, radius) {
      let nx = x, nz = z;
      for (let pass = 0; pass < 2; pass++) {
        for (const c of colliders) {
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
