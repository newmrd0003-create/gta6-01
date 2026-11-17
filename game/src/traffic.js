// SOLARA HEAT — traffic
// The city's cars. They cruise the street grid, turn at intersections,
// slow for whatever is ahead of them, and stop when Leo blocks the road.
// Parked cars along the kerb are the ones he can steal. A car that drifts
// far from Leo reappears on a street near him, so the roads around him
// stay busy instead of emptying out as he drives on.

import { spawnCar } from './vehicles.js';
import { GRID, PALETTE, BALANCE, worldRng, choose, between, snapStreet, clampNum } from './config.js';

const DIR4 = [
  { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
];

function dirHeading(d) {
  return Math.atan2(d.x, d.z);
}

export function makeTraffic(scene, count) {
  const r = worldRng;
  const flow = [];
  const parked = [];

  function streetSpot(nearX, nearZ) {
    // A street line and a spot along it, offset into the right-hand lane.
    // Near a point when one is given (both axes within ~120 m of it),
    // anywhere in the city otherwise.
    const across = r() < 0.5;
    if (nearX === undefined) {
      const line = snapStreet(between(r, -300, 300));
      const along = between(r, -300, 300);
      return across
        ? { x: along, z: line + 3, dir: choose(r, [DIR4[0], DIR4[1]]) }
        : { x: line + 3, z: along, dir: choose(r, [DIR4[2], DIR4[3]]) };
    }
    const line = snapStreet(clampNum((across ? nearZ : nearX) + between(r, -120, 120), -300, 300));
    const along = clampNum((across ? nearX : nearZ) + between(r, -120, 120), -300, 300);
    return across
      ? { x: along, z: line + 3, dir: choose(r, [DIR4[0], DIR4[1]]) }
      : { x: line + 3, z: along, dir: choose(r, [DIR4[2], DIR4[3]]) };
  }

  function launch(spot) {
    const car = spawnCar(scene, spot.x, spot.z, dirHeading(spot.dir), choose(r, PALETTE.paint), false);
    car.dir = spot.dir;
    car.cruise = between(r, BALANCE.cruiseLo, BALANCE.cruiseHi);
    car.wait = 0;
    return car;
  }

  for (let i = 0; i < count; i++) flow.push(launch(streetSpot()));

  // Parked cars along the kerb — stealable, engines off.
  for (let i = 0; i < 10; i++) {
    const line = snapStreet(between(r, -280, 280));
    const along = between(r, -280, 280);
    const across = r() < 0.5;
    const x = across ? along : line + 4.5;
    const z = across ? line + 4.5 : along;
    const car = spawnCar(scene, x, z, dirHeading(across ? DIR4[0] : DIR4[2]), choose(r, PALETTE.paint), false);
    car.dir = across ? DIR4[0] : DIR4[2];
    car.parked = true;
    parked.push(car);
  }

  function onCrossing(car) {
    return Math.abs(car.x - snapStreet(car.x)) < 2.5
      && Math.abs(car.z - snapStreet(car.z)) < 2.5;
  }

  // Gap ahead of `car` along its direction to the nearest obstacle (a
  // car in traffic, or Leo's car), ignoring anything beside it.
  function gapAhead(car, heroCar) {
    let ahead = 999;
    const measure = (ox, oz) => {
      const dx = ox - car.x, dz = oz - car.z;
      const along = dx * car.dir.x + dz * car.dir.z;
      const side = Math.abs(dx * car.dir.z - dz * car.dir.x);
      if (along > 0 && along < ahead && side < 3) ahead = along;
    };
    for (const other of flow) {
      if (other === car) continue;
      measure(other.x, other.z);
    }
    if (heroCar) measure(heroCar.x, heroCar.z);
    return ahead;
  }

  function tick(dt, heroPos, heroCar) {
    const px = heroCar ? heroCar.x : (heroPos ? heroPos.x : 0);
    const pz = heroCar ? heroCar.z : (heroPos ? heroPos.z : 0);
    for (const car of flow) {
      // Slow for whatever is ahead — traffic, or Leo's car.
      const ahead = gapAhead(car, heroCar);
      const want = ahead < 12 ? 0 : car.cruise;
      car.speed += (want - car.speed) * Math.min(1, dt * 1.5);
      car.x += car.dir.x * car.speed * dt;
      car.z += car.dir.z * car.speed * dt;
      // Turn at an intersection, sometimes.
      if (onCrossing(car) && r() < dt * 0.5) {
        const across = car.dir.z === 0;
        car.dir = across
          ? choose(r, [DIR4[2], DIR4[3]])
          : choose(r, [DIR4[0], DIR4[1]]);
        car.x = snapStreet(car.x);
        car.z = snapStreet(car.z);
      }
      // Turn around at the city edge instead of driving out of it.
      if (Math.abs(car.x) > GRID.half || Math.abs(car.z) > GRID.half) {
        car.dir = { x: -car.dir.x, z: -car.dir.z };
      }
      // Nudge out of Leo's car instead of driving through it.
      if (heroCar) {
        const d = Math.hypot(car.x - heroCar.x, car.z - heroCar.z);
        if (d < 4.4 && d > 0.01) {
          const push = (4.4 - d) / d;
          car.x += (car.x - heroCar.x) * push * 0.5;
          car.z += (car.z - heroCar.z) * push * 0.5;
          car.speed *= 0.9;
        }
      }
      // A car that has driven far from Leo reappears on a street near
      // him — the city never runs out of traffic around the player.
      if (Math.hypot(car.x - px, car.z - pz) > 260) {
        const spot = streetSpot(px, pz);
        car.x = spot.x;
        car.z = spot.z;
        car.dir = spot.dir;
        car.speed = car.cruise;
        car.heading = dirHeading(car.dir);
      }
      car.heading = dirHeading(car.dir);
      car.refresh();
    }
  }

  return {
    cars: flow, parked,
    tick,
    // Nearest drivable car to a point (traffic counts too — stealing a
    // moving car works, it just takes the driver out of it).
    closest(x, z, maxDist) {
      let best = null, bd = maxDist;
      for (const c of [...flow, ...parked]) {
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
    takeOut(car) {
      const i = flow.indexOf(car);
      if (i >= 0) flow.splice(i, 1);
      const j = parked.indexOf(car);
      if (j >= 0) parked.splice(j, 1);
    },
    // Put a few cars on the streets around a point — the screenshot
    // staging uses this so a shot never shows an empty avenue.
    seedNear(x, z, n) {
      for (let i = 0; i < n; i++) {
        flow.push(launch(streetSpot(x, z)));
      }
    },
  };
}
