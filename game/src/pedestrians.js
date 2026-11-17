// SOLARA HEAT — pedestrians.js
// One job: the people of Costa Solara. Walkers stroll the sidewalks, change
// direction at corners, and run away from gunfire, speeding cars and the
// player's fists. A knocked-down pedestrian stays down, then gets up.

import * as THREE from 'three';
import { WORLD, PALETTE, rng, pick, rand, snapRoad } from './config.js';

function buildPedMesh(shirtColor, skinColor, pantsColor) {
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
  g.userData.legs = legs;
  return g;
}

const SKINS = [0xe8b88a, 0xc88a5a, 0x8a5a38, 0xf0c8a0];

export function createPedestrians(scene, count) {
  const r = rng;
  const peds = [];

  function sidewalkSpot() {
    const line = snapRoad(rand(r, -300, 300));
    const along = rand(r, -300, 300);
    if (r() < 0.5) return { x: along, z: line + 8.5 };
    return { x: line + 8.5, z: along };
  }

  for (let i = 0; i < count; i++) {
    const s = sidewalkSpot();
    const mesh = buildPedMesh(pick(r, PALETTE.pedShirt), pick(r, SKINS), pick(r, [0x2a3a5a, 0x3a3a3a, 0x5a3a2a]));
    mesh.position.set(s.x, 0, s.z);
    scene.add(mesh);
    // One in six pedestrians is an idler — standing, checking a phone,
    // not walking anywhere until something scares them.
    const idle = r() < 0.17;
    peds.push({
      mesh, x: s.x, z: s.z,
      heading: rand(r, 0, Math.PI * 2),
      speed: rand(r, 1.1, 1.9),
      walkPhase: rand(r, 0, 6),
      down: 0,        // seconds remaining knocked down
      fleeing: 0,     // seconds remaining fleeing
      idle,           // stands still until frightened
      targetX: s.x, targetZ: s.z,
    });
  }

  function pickTarget(p) {
    // walk to a nearby sidewalk point
    const line = snapRoad(p.x + rand(r, -90, 90));
    const along = rand(r, -300, 300);
    if (r() < 0.5) { p.targetX = along; p.targetZ = line + 8.5; }
    else { p.targetX = line + 8.5; p.targetZ = along; }
  }

  function update(dt, threats) {
    for (const p of peds) {
      if (p.down > 0) {
        p.down -= dt;
        p.mesh.rotation.x = p.down > 0 ? -Math.PI / 2 : 0;
        p.mesh.position.y = p.down > 0 ? 0.3 : 0;
        if (p.down <= 0) { p.mesh.rotation.x = 0; p.mesh.position.y = 0; }
        continue;
      }
      // flee from the nearest threat
      let fx = 0, fz = 0, nearest = 999;
      for (const t of threats) {
        const d = Math.hypot(p.x - t.x, p.z - t.z);
        if (d < t.radius && d < nearest) {
          nearest = d;
          fx = p.x - t.x; fz = p.z - t.z;
        }
      }
      if (nearest < 999) {
        p.fleeing = 1.2;
        p.idle = false;
        const len = Math.hypot(fx, fz) || 1;
        p.heading = Math.atan2(fx / len, fz / len);
      } else if (p.fleeing > 0) {
        p.fleeing -= dt;
      } else if (p.idle) {
        // standing still — a small sway, no walking
        p.mesh.rotation.y = p.heading + Math.sin(performance.now() / 900 + p.walkPhase) * 0.15;
        p.mesh.userData.armL.rotation.x = 0.2;
        p.mesh.userData.armR.rotation.x = 0.2;
        continue;
      } else {
        const d = Math.hypot(p.targetX - p.x, p.targetZ - p.z);
        if (d < 2) pickTarget(p);
        else p.heading = Math.atan2(p.targetX - p.x, p.targetZ - p.z);
      }
      const speed = p.fleeing > 0 ? 5.2 : p.speed;
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      p.x = Math.max(-WORLD.half, Math.min(WORLD.half, p.x));
      p.z = Math.max(-WORLD.half, Math.min(WORLD.half, p.z));
      p.walkPhase += dt * speed * 3.2;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      const swing = Math.sin(p.walkPhase) * 0.5;
      p.mesh.userData.armL.rotation.x = swing;
      p.mesh.userData.armR.rotation.x = -swing;
    }
  }

  return {
    peds, update,
    // Move a few pedestrians onto the sidewalks near a point — the
    // screenshot staging uses this so a foot shot shows people, not an
    // empty plaza.
    gatherNear(x, z, n) {
      let placed = 0;
      for (const p of peds) {
        if (placed >= n) break;
        if (p.down > 0) continue;
        const s = { x: x + rand(r, -25, 25), z: z + rand(r, -25, 25) };
        p.x = Math.max(-WORLD.half, Math.min(WORLD.half, s.x));
        p.z = Math.max(-WORLD.half, Math.min(WORLD.half, s.z));
        p.targetX = p.x; p.targetZ = p.z;
        p.idle = false;
        p.mesh.position.set(p.x, 0, p.z);
        placed += 1;
      }
      return placed;
    },
    // Knock one down — and scare everyone close by, so a punch or a
    // hit-and-run empties the sidewalk instead of leaving witnesses calm.
    knockDown(p) {
      p.down = 4; p.fleeing = 0;
      for (const q of peds) {
        if (q === p || q.down > 0) continue;
        if (Math.hypot(q.x - p.x, q.z - p.z) < 14) {
          q.fleeing = 2.5;
          q.idle = false;
          q.heading = Math.atan2(q.x - p.x, q.z - p.z);
        }
      }
    },
    // Frighten everyone within `radius` of a point (gunfire, a crash).
    fleeFrom(x, z, radius) {
      for (const q of peds) {
        if (q.down > 0) continue;
        if (Math.hypot(q.x - x, q.z - z) < radius) {
          q.fleeing = 2;
          q.idle = false;
          q.heading = Math.atan2(q.x - x, q.z - z);
        }
      }
    },
    nearest(x, z, maxDist) {
      let best = null, bd = maxDist;
      for (const p of peds) {
        if (p.down > 0) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
  };
}
