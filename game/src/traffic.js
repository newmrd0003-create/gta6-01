// SOLARA HEAT — traffic.js
// One job: the city's traffic. Cars cruise the road grid, turn at
// intersections, slow for the car ahead, and stop when the player blocks
// them. Parked cars are the ones the player can steal. Cars that drift far
// from the player respawn on a road near them, so the streets around the
// player are always busy instead of emptying out as the player drives on.

import { createCar } from './vehicles.js';
import { WORLD, PALETTE, TUNING, rng, pick, rand, snapRoad, clamp } from './config.js';

const DIRS = [
  { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
];

function headingOf(d) { return Math.atan2(d.x, d.z); }

export function createTraffic(scene, count) {
  const r = rng;
  const cars = [];
  const parked = [];

  function randomRoadSpot(nearX, nearZ) {
    // Pick a road line and a position along it, offset to the right lane.
    // Near a point when one is given (both axes within ~120 m of it),
    // anywhere in the city otherwise.
    const horizontal = r() < 0.5;
    if (nearX === undefined) {
      const line = snapRoad(rand(r, -300, 300));
      const along = rand(r, -300, 300);
      return horizontal
        ? { x: along, z: line + 3, dir: pick(r, [DIRS[0], DIRS[1]]) }
        : { x: line + 3, z: along, dir: pick(r, [DIRS[2], DIRS[3]]) };
    }
    const line = snapRoad(clamp((horizontal ? nearZ : nearX) + rand(r, -120, 120), -300, 300));
    const along = clamp((horizontal ? nearX : nearZ) + rand(r, -120, 120), -300, 300);
    return horizontal
      ? { x: along, z: line + 3, dir: pick(r, [DIRS[0], DIRS[1]]) }
      : { x: line + 3, z: along, dir: pick(r, [DIRS[2], DIRS[3]]) };
  }

  function spawnCruiserCar(spot) {
    const car = createCar(scene, spot.x, spot.z, headingOf(spot.dir), pick(r, PALETTE.car), false);
    car.dir = spot.dir;
    car.cruise = rand(r, TUNING.trafficCruiseMin, TUNING.trafficCruiseMax);
    car.wait = 0;
    return car;
  }

  for (let i = 0; i < count; i++) cars.push(spawnCruiserCar(randomRoadSpot()));

  // Parked cars along the kerb — stealable, engine off.
  for (let i = 0; i < 10; i++) {
    const line = snapRoad(rand(r, -280, 280));
    const along = rand(r, -280, 280);
    const horizontal = r() < 0.5;
    const x = horizontal ? along : line + 4.5;
    const z = horizontal ? line + 4.5 : along;
    const car = createCar(scene, x, z, headingOf(horizontal ? DIRS[0] : DIRS[2]), pick(r, PALETTE.car), false);
    car.dir = horizontal ? DIRS[0] : DIRS[2];
    car.parked = true;
    parked.push(car);
  }

  function atIntersection(car) {
    const mx = Math.abs(car.x - snapRoad(car.x));
    const mz = Math.abs(car.z - snapRoad(car.z));
    return mx < 2.5 && mz < 2.5;
  }

  // Distance ahead of `car` along its direction to the nearest obstacle
  // (another car, or the player's car), ignoring anything beside it.
  function gapAhead(car, playerCar) {
    let ahead = 999;
    const measure = (ox, oz) => {
      const dx = ox - car.x, dz = oz - car.z;
      const along = dx * car.dir.x + dz * car.dir.z;
      const side = Math.abs(dx * car.dir.z - dz * car.dir.x);
      if (along > 0 && along < ahead && side < 3) ahead = along;
    };
    for (const other of cars) {
      if (other === car) continue;
      measure(other.x, other.z);
    }
    if (playerCar) measure(playerCar.x, playerCar.z);
    return ahead;
  }

  function update(dt, playerPos, playerCar) {
    const px = playerCar ? playerCar.x : (playerPos ? playerPos.x : 0);
    const pz = playerCar ? playerCar.z : (playerPos ? playerPos.z : 0);
    for (const car of cars) {
      // slow for the car ahead (traffic or the player's car)
      const ahead = gapAhead(car, playerCar);
      const want = ahead < 12 ? 0 : car.cruise;
      car.speed += (want - car.speed) * Math.min(1, dt * 1.5);
      car.x += car.dir.x * car.speed * dt;
      car.z += car.dir.z * car.speed * dt;
      // turn at an intersection, sometimes
      if (atIntersection(car) && r() < dt * 0.5) {
        const horizontal = car.dir.z === 0;
        car.dir = horizontal
          ? pick(r, [DIRS[2], DIRS[3]])
          : pick(r, [DIRS[0], DIRS[1]]);
        car.x = snapRoad(car.x);
        car.z = snapRoad(car.z);
      }
      // keep inside the city; turn around at the edge
      if (Math.abs(car.x) > WORLD.half || Math.abs(car.z) > WORLD.half) {
        car.dir = { x: -car.dir.x, z: -car.dir.z };
      }
      // nudge out of the player's car instead of driving through it
      if (playerCar) {
        const d = Math.hypot(car.x - playerCar.x, car.z - playerCar.z);
        if (d < 4.4 && d > 0.01) {
          const push = (4.4 - d) / d;
          car.x += (car.x - playerCar.x) * push * 0.5;
          car.z += (car.z - playerCar.z) * push * 0.5;
          car.speed *= 0.9;
        }
      }
      // a car that has driven far from the player reappears on a road
      // near them — the city never runs out of traffic around the player.
      if (Math.hypot(car.x - px, car.z - pz) > 260) {
        const spot = randomRoadSpot(px, pz);
        car.x = spot.x; car.z = spot.z; car.dir = spot.dir;
        car.speed = car.cruise;
        car.heading = headingOf(car.dir);
      }
      car.heading = headingOf(car.dir);
      car.sync();
    }
  }

  return {
    cars, parked,
    update,
    // Nearest drivable car to a point (traffic counts too — stealing a
    // moving car is allowed, it just takes the driver out of it).
    nearestDrivable(x, z, maxDist) {
      let best = null, bd = maxDist;
      for (const c of [...cars, ...parked]) {
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
    removeFromTraffic(car) {
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
      const j = parked.indexOf(car);
      if (j >= 0) parked.splice(j, 1);
    },
    // Put a few cars on the roads around a point — the screenshot staging
    // uses this so a shot never shows an empty avenue.
    seedNear(x, z, n) {
      for (let i = 0; i < n; i++) {
        const car = spawnCruiserCar(randomRoadSpot(x, z));
        cars.push(car);
      }
    },
  };
}
