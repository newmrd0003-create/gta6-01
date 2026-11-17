// SOLARA HEAT — police
// The wanted system and the Solara PD. Crimes raise stars; cruisers spawn
// on the streets at the city's edge, chase Leo, ram his car, and bust him
// on foot. Lose them, and the heat cools off one star at a time.

import { spawnCar } from './vehicles.js';
import { GRID, BALANCE, clampNum, steerTo, snapStreet } from './config.js';

export const MAX_HEAT_STARS = 5;

export function makePolice(scene) {
  const units = [];
  let wanted = 0;
  let heat = 0;          // 0..100, drives how many cruisers hunt
  let coolClock = 0;     // seconds since a cruiser last saw Leo
  let bustClock = 0;     // seconds a cruiser has touched Leo on foot
  let lastGap = Infinity; // distance to the closest cruiser, last frame

  // Spawn on a street, not inside a tower: take the street line nearest
  // the target point and offset into the lane.
  function spawnOnStreet(x, z) {
    const across = Math.random() < 0.5;
    const sx = across ? x : snapStreet(x) + 3;
    const sz = across ? snapStreet(z) + 3 : z;
    const car = spawnCar(scene,
      clampNum(sx, -GRID.half, GRID.half), clampNum(sz, -GRID.half, GRID.half),
      0, 0x1a1a22, true);
    car.cruise = 0;
    units.push(car);
    return car;
  }

  function spawnUnit(px, pz) {
    // Spawn at the edge nearest Leo, on a street.
    const edge = Math.random() < 0.5;
    const x = edge ? (px > 0 ? -300 : 300) : px + (Math.random() < 0.5 ? -120 : 120);
    const z = edge ? pz + (Math.random() < 0.5 ? -120 : 120) : (pz > 0 ? -300 : 300);
    return spawnOnStreet(x, z);
  }

  function wantCount() {
    if (wanted === 0) return 0;
    return Math.min(1 + wanted, 6);
  }

  function tick(dt, hero, heroCar, onBusted, onRam) {
    // Spawn / despawn to match the wanted level.
    if (wanted > 0) {
      while (units.length < wantCount()) spawnUnit(hero.x, hero.z);
    } else {
      while (units.length > 0) units.pop().drop();
    }
    const tx = heroCar ? heroCar.x : hero.x;
    const tz = heroCar ? heroCar.z : hero.z;
    let near = 999;
    for (const c of units) {
      const dx = tx - c.x, dz = tz - c.z;
      const d = Math.hypot(dx, dz);
      near = Math.min(near, d);
      // Steer toward Leo with a little wobble so rams feel alive.
      const wantDir = Math.atan2(dx, dz) + Math.sin(performance.now() / 700 + c.x) * 0.08;
      c.heading = steerTo(c.heading, wantDir, 2.2 * dt);
      const topSpeed = d > 60 ? BALANCE.copFar : d > 18 ? 30 : BALANCE.copNear;
      c.speed += (topSpeed - c.speed) * Math.min(1, dt * 1.2);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      // Ram: shove Leo's car and hurt it — but never drive through it:
      // keep a car's length between the two bumpers. The shove runs
      // mostly FORWARD along Leo's heading (a rear-end hit), with only a
      // small sideways part, so a ram cannot push Leo off the street and
      // into a tower. The speed loss is a steady drag while touching, not
      // a per-frame multiply that would stall the car the moment two
      // cruisers touch it at once.
      if (heroCar && d < 5.2) {
        const shove = 5 * dt;
        heroCar.x += Math.sin(heroCar.heading) * shove;
        heroCar.z += Math.cos(heroCar.heading) * shove;
        if (d > 0.01) {
          const away = 2 * dt;
          heroCar.x += ((tx - c.x) / d) * away;
          heroCar.z += ((tz - c.z) / d) * away;
        }
        heroCar.speed -= 1.5 * dt;
        heroCar.hp -= 3 * dt;
        if (onRam) onRam();
        // Separation: back the cruiser off so the cars never overlap.
        if (d < 5.0 && d > 0.01) {
          const back = (5.0 - d) / d;
          c.x -= (tx - c.x) * back;
          c.z -= (tz - c.z) * back;
        }
      }
      // The flashing light bar.
      const phase = Math.floor(performance.now() / 220) % 2 === 0;
      if (c.mesh.userData.lampRed) {
        c.mesh.userData.lampRed.visible = phase;
        c.mesh.userData.lampBlue.visible = !phase;
      }
      c.refresh();
    }
    // Heat cools when no cruiser is close.
    if (wanted > 0) {
      if (near > 70) {
        coolClock += dt;
        if (coolClock > BALANCE.coolOff) {
          wanted = Math.max(0, wanted - 1);
          heat = Math.max(0, heat - 25);
          coolClock = 0;
        }
      } else coolClock = 0;
    }
    // Busted: a cruiser touching Leo on foot.
    if (wanted > 0 && !heroCar && near < 3.4) {
      bustClock += dt;
      if (bustClock > BALANCE.bustHold) {
        bustClock = 0;
        wanted = 0;
        heat = 0;
        if (onBusted) onBusted();
      }
    } else {
      bustClock = Math.max(0, bustClock - dt * 2);
    }
    lastGap = near;
    return { nearest: near, bustTimer: bustClock };
  }

  return {
    units,
    get wanted() { return wanted; },
    get heat() { return heat; },
    get nearest() {
      // Distance to the closest cruiser, for the siren falloff; Infinity
      // when no cruiser is hunting.
      return lastGap;
    },
    addHeat(amount) {
      heat = clampNum(heat + amount, 0, 100);
      const stars = Math.min(MAX_HEAT_STARS, 1 + Math.floor(heat / 22));
      if (stars > wanted) wanted = stars;
    },
    clearHeat() { wanted = 0; heat = 0; coolClock = 0; },
    setHeat(stars) { wanted = clampNum(stars, 0, MAX_HEAT_STARS); heat = stars * 22; },
    // Put a cruiser on the street right behind a point — the chase staging
    // uses this so the shot shows the PD in the mirror, not a mile away.
    dropNear(x, z, behindDir) {
      const bx = x - Math.sin(behindDir) * 26;
      const bz = z - Math.cos(behindDir) * 26;
      const car = spawnOnStreet(bx, bz);
      car.heading = behindDir;
      car.speed = 24;
      return car;
    },
    tick,
  };
}
