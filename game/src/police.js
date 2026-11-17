// SOLARA HEAT — police.js
// One job: the wanted system and the Solara PD. Crimes raise stars; police
// cruisers spawn on the roads at the city's edge, chase the player, ram the
// player's car, and bust the player on foot. Lose them, and the heat cools
// off one star at a time.

import { createCar } from './vehicles.js';
import { WORLD, TUNING, clamp, turnToward, snapRoad } from './config.js';

export const MAX_STARS = 5;

export function createPolice(scene) {
  const cruisers = [];
  let wanted = 0;
  let heat = 0;            // 0..100, drives how many cruisers hunt
  let coolTimer = 0;       // seconds since a cruiser last saw the player
  let bustTimer = 0;       // seconds a cruiser has touched the player on foot
  let lastNearest = Infinity; // distance to the closest cruiser, last frame

  // Spawn on a road, not inside a building: pick the road line nearest
  // the target point, offset into the lane.
  function spawnOnRoad(x, z) {
    const horizontal = Math.random() < 0.5;
    const sx = horizontal ? x : snapRoad(x) + 3;
    const sz = horizontal ? snapRoad(z) + 3 : z;
    const car = createCar(scene, clamp(sx, -WORLD.half, WORLD.half), clamp(sz, -WORLD.half, WORLD.half), 0, 0x1a1a22, true);
    car.cruise = 0;
    cruisers.push(car);
    return car;
  }

  function spawnCruiser(px, pz) {
    // Spawn at the edge nearest the player, on a road.
    const edge = Math.random() < 0.5;
    const x = edge ? (px > 0 ? -300 : 300) : px + (Math.random() < 0.5 ? -120 : 120);
    const z = edge ? pz + (Math.random() < 0.5 ? -120 : 120) : (pz > 0 ? -300 : 300);
    return spawnOnRoad(x, z);
  }

  function desiredCruisers() {
    if (wanted === 0) return 0;
    return Math.min(1 + wanted, 6);
  }

  function update(dt, player, playerCar, onBusted, onRam) {
    // spawn / despawn to match the wanted level
    if (wanted > 0) {
      while (cruisers.length < desiredCruisers()) spawnCruiser(player.x, player.z);
    } else {
      while (cruisers.length > 0) cruisers.pop().remove();
    }
    const tx = playerCar ? playerCar.x : player.x;
    const tz = playerCar ? playerCar.z : player.z;
    let nearest = 999;
    for (const c of cruisers) {
      const dx = tx - c.x, dz = tz - c.z;
      const d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, d);
      // steer toward the player with a little wobble so rams feel alive
      const wantHeading = Math.atan2(dx, dz) + Math.sin(performance.now() / 700 + c.x) * 0.08;
      c.heading = turnToward(c.heading, wantHeading, 2.2 * dt);
      const targetSpeed = d > 60 ? TUNING.policeTopSpeedFar : d > 18 ? 30 : TUNING.policeTopSpeedNear;
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.2);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      // ram: push the player's car and hurt it — but never drive through
      // it: keep a car's length between the two bumpers. The push is
      // mostly FORWARD along the player's heading (a rear-end shove), with
      // only a small sideways component, so a ram cannot shove the player
      // off the road and into a building. The speed loss is a steady drag
      // while touching, not a per-frame multiply that would stall the car
      // the moment two cruisers touch it at once.
      if (playerCar && d < 5.2) {
        const push = 5 * dt;
        playerCar.x += Math.sin(playerCar.heading) * push;
        playerCar.z += Math.cos(playerCar.heading) * push;
        if (d > 0.01) {
          const away = 2 * dt;
          playerCar.x += ((tx - c.x) / d) * away;
          playerCar.z += ((tz - c.z) / d) * away;
        }
        playerCar.speed -= 1.5 * dt;
        playerCar.health -= 3 * dt;
        if (onRam) onRam();
        // separation: back the cruiser off so the two cars never overlap
        if (d < 5.0 && d > 0.01) {
          const back = (5.0 - d) / d;
          c.x -= (tx - c.x) * back;
          c.z -= (tz - c.z) * back;
        }
      }
      // flashing light bar
      const phase = Math.floor(performance.now() / 220) % 2 === 0;
      if (c.mesh.userData.lightRed) {
        c.mesh.userData.lightRed.visible = phase;
        c.mesh.userData.lightBlue.visible = !phase;
      }
      c.sync();
    }
    // heat cools when no cruiser is close
    if (wanted > 0) {
      if (nearest > 70) {
        coolTimer += dt;
        if (coolTimer > TUNING.wantedCoolSeconds) {
          wanted = Math.max(0, wanted - 1);
          heat = Math.max(0, heat - 25);
          coolTimer = 0;
        }
      } else coolTimer = 0;
    }
    // busted: a cruiser touching the player on foot
    if (wanted > 0 && !playerCar && nearest < 3.4) {
      bustTimer += dt;
      if (bustTimer > TUNING.bustHoldSeconds) {
        bustTimer = 0;
        wanted = 0; heat = 0;
        if (onBusted) onBusted();
      }
    } else {
      bustTimer = Math.max(0, bustTimer - dt * 2);
    }
    lastNearest = nearest;
    return { nearest, bustTimer };
  }

  return {
    cruisers,
    get wanted() { return wanted; },
    get heat() { return heat; },
    get nearestDist() {
      // Distance to the closest cruiser, for the siren falloff; Infinity
      // when no cruiser is hunting.
      return lastNearest;
    },
    addHeat(amount) {
      heat = clamp(heat + amount, 0, 100);
      const stars = Math.min(MAX_STARS, 1 + Math.floor(heat / 22));
      if (stars > wanted) wanted = stars;
    },
    clearWanted() { wanted = 0; heat = 0; coolTimer = 0; },
    setWanted(stars) { wanted = clamp(stars, 0, MAX_STARS); heat = stars * 22; },
    // Put a cruiser on the road right behind a point — the chase staging
    // uses this so the shot shows the PD in the mirror, not a mile away.
    spawnNear(x, z, behindHeading) {
      const bx = x - Math.sin(behindHeading) * 26;
      const bz = z - Math.cos(behindHeading) * 26;
      const car = spawnOnRoad(bx, bz);
      car.heading = behindHeading;
      car.speed = 24;
      return car;
    },
    update,
  };
}
