// SOLARA HEAT — pedestrians
// The people of Costa Solara. Walkers stroll the pavements, change
// direction at corners, and run from gunfire, speeding cars and Leo's
// fists. A knocked-down walker stays down, then gets up.

import * as THREE from 'three';
import { GRID, PALETTE, worldRng, choose, between, snapStreet } from './config.js';

function buildWalker(shirtColor, skinColor, pantsColor) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), pants);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), shirt);
  armL.position.set(-0.4, 1.15, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(armR);
  g.userData.armL = armL;
  g.userData.armR = armR;
  return g;
}

const SKINS = [0xe8b88a, 0xc88a5a, 0x8a5a38, 0xf0c8a0];

export function makeCrowd(scene, count) {
  const r = worldRng;
  const folk = [];

  function pavementSpot() {
    const line = snapStreet(between(r, -300, 300));
    const along = between(r, -300, 300);
    if (r() < 0.5) return { x: along, z: line + 8.5 };
    return { x: line + 8.5, z: along };
  }

  for (let i = 0; i < count; i++) {
    const s = pavementSpot();
    const mesh = buildWalker(
      choose(r, PALETTE.shirt), choose(r, SKINS), choose(r, [0x2a3a5a, 0x3a3a3a, 0x5a3a2a]));
    mesh.position.set(s.x, 0, s.z);
    scene.add(mesh);
    // One in six walkers is an idler — standing, checking a phone, going
    // nowhere until something scares them.
    const loafing = r() < 0.17;
    folk.push({
      mesh, x: s.x, z: s.z,
      dir: between(r, 0, Math.PI * 2),
      pace: between(r, 1.1, 1.9),
      phase: between(r, 0, 6),
      downT: 0,    // seconds left knocked down
      fleeT: 0,    // seconds left fleeing
      loafing,     // stands still until frightened
      gx: s.x, gz: s.z,
    });
  }

  function newGoal(p) {
    // Walk to a nearby pavement point.
    const line = snapStreet(p.x + between(r, -90, 90));
    const along = between(r, -300, 300);
    if (r() < 0.5) { p.gx = along; p.gz = line + 8.5; }
    else { p.gx = line + 8.5; p.gz = along; }
  }

  function tick(dt, threats) {
    for (const p of folk) {
      if (p.downT > 0) {
        p.downT -= dt;
        p.mesh.rotation.x = p.downT > 0 ? -Math.PI / 2 : 0;
        p.mesh.position.y = p.downT > 0 ? 0.3 : 0;
        if (p.downT <= 0) { p.mesh.rotation.x = 0; p.mesh.position.y = 0; }
        continue;
      }
      // Flee from the nearest threat.
      let fx = 0, fz = 0, near = 999;
      for (const t of threats) {
        const d = Math.hypot(p.x - t.x, p.z - t.z);
        if (d < t.radius && d < near) {
          near = d;
          fx = p.x - t.x;
          fz = p.z - t.z;
        }
      }
      if (near < 999) {
        p.fleeT = 1.2;
        p.loafing = false;
        const len = Math.hypot(fx, fz) || 1;
        p.dir = Math.atan2(fx / len, fz / len);
      } else if (p.fleeT > 0) {
        p.fleeT -= dt;
      } else if (p.loafing) {
        // Standing still — a small sway, no walking.
        p.mesh.rotation.y = p.dir + Math.sin(performance.now() / 900 + p.phase) * 0.15;
        p.mesh.userData.armL.rotation.x = 0.2;
        p.mesh.userData.armR.rotation.x = 0.2;
        continue;
      } else {
        const d = Math.hypot(p.gx - p.x, p.gz - p.z);
        if (d < 2) newGoal(p);
        else p.dir = Math.atan2(p.gx - p.x, p.gz - p.z);
      }
      const speed = p.fleeT > 0 ? 5.2 : p.pace;
      p.x += Math.sin(p.dir) * speed * dt;
      p.z += Math.cos(p.dir) * speed * dt;
      p.x = Math.max(-GRID.half, Math.min(GRID.half, p.x));
      p.z = Math.max(-GRID.half, Math.min(GRID.half, p.z));
      p.phase += dt * speed * 3.2;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.dir;
      const swing = Math.sin(p.phase) * 0.5;
      p.mesh.userData.armL.rotation.x = swing;
      p.mesh.userData.armR.rotation.x = -swing;
    }
  }

  return {
    folk, tick,
    // Move a few walkers onto the pavements near a point — the screenshot
    // staging uses this so a foot shot shows people, not an empty plaza.
    pullNear(x, z, n) {
      let placed = 0;
      for (const p of folk) {
        if (placed >= n) break;
        if (p.downT > 0) continue;
        p.x = Math.max(-GRID.half, Math.min(GRID.half, x + between(r, -25, 25)));
        p.z = Math.max(-GRID.half, Math.min(GRID.half, z + between(r, -25, 25)));
        p.gx = p.x;
        p.gz = p.z;
        p.loafing = false;
        p.mesh.position.set(p.x, 0, p.z);
        placed += 1;
      }
      return placed;
    },
    // Knock one down — and scare everyone close by, so a punch or a
    // hit-and-run empties the pavement instead of leaving witnesses calm.
    floorIt(p) {
      p.downT = 4;
      p.fleeT = 0;
      for (const q of folk) {
        if (q === p || q.downT > 0) continue;
        if (Math.hypot(q.x - p.x, q.z - p.z) < 14) {
          q.fleeT = 2.5;
          q.loafing = false;
          q.dir = Math.atan2(q.x - p.x, q.z - p.z);
        }
      }
    },
    // Frighten everyone within `radius` of a point (gunfire, a crash).
    scatter(x, z, radius) {
      for (const q of folk) {
        if (q.downT > 0) continue;
        if (Math.hypot(q.x - x, q.z - z) < radius) {
          q.fleeT = 2;
          q.loafing = false;
          q.dir = Math.atan2(q.x - x, q.z - z);
        }
      }
    },
    closest(x, z, maxDist) {
      let best = null, bd = maxDist;
      for (const p of folk) {
        if (p.downT > 0) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
  };
}
