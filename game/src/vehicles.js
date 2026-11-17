// SOLARA HEAT — vehicles.js
// One job: build car meshes and drive them. One arcade car model serves the
// player, traffic and police; physics is simple (throttle, steering that
// scales with speed, drag, collision push-out) and feels right at 60 fps.

import * as THREE from 'three';
import { PALETTE, clamp } from './config.js';

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2a38 });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xd02020 });

export function buildCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.9), bodyMat);
  hood.position.set(0, 0.95, 1.7);
  g.add(hood);
  // headlights + tail lights
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lightMat);
    hl.position.set(sx, 0.66, 2.22);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    tl.position.set(sx, 0.66, -2.22);
    g.add(tl);
  }
  const wheels = [];
  const frontWheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
    if (wz > 0) frontWheels.push(w);
  }
  // Brake lights flare when the driver brakes; the tail lights stay dim.
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x881010 });
  const brakeLights = [];
  for (const sx of [-0.7, 0.7]) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), brakeMat);
    bl.position.set(sx, 0.66, -2.22);
    g.add(bl);
    brakeLights.push(bl);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.4), chromeMat);
    bar.position.set(0, 1.52, -0.25);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.32, 1.56, -0.25);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(0.32, 1.56, -0.25);
    g.add(blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.78;
    g.add(stripe);
  }
  g.userData.wheels = wheels;
  g.userData.frontWheels = frontWheels;
  g.userData.brakeMat = brakeMat;
  g.userData.brakeLights = brakeLights;
  return g;
}

// Arcade car state. x/z in metres, heading in radians (0 = -z / north).
export function createCar(scene, x, z, heading, color, isPolice) {
  const mesh = buildCarMesh(color, isPolice);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh, x, z, heading,
    speed: 0,
    color, isPolice: !!isPolice,
    health: 100,
    steerVis: 0,
    braking: false,
    // Light the brake lights. Called by whoever drives this car.
    setBrake(on) {
      this.braking = on;
      this.mesh.userData.brakeMat.color.setHex(on ? 0xff3030 : 0x881010);
    },
    // Advance one fixed step with throttle (-1..1), steer (-1..1), brake.
    drive(dt, throttle, steer, brake, topSpeed) {
      const top = topSpeed || 34;
      const accel = throttle > 0 ? 16 : 9;
      this.speed += throttle * accel * dt;
      if (brake) this.speed -= Math.sign(this.speed) * 26 * dt;
      // drag + rolling resistance
      this.speed -= this.speed * 0.55 * dt;
      if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
      this.speed = clamp(this.speed, -10, top);
      const turn = steer * clamp(Math.abs(this.speed) / 9, 0, 1) * 1.9;
      this.heading += turn * dt * Math.sign(this.speed || 1);
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      this.steerVis = steer;
      this.setBrake(!!brake);
      this.sync();
    },
    sync() {
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.heading;
      // body roll + pitch sell the speed
      this.mesh.rotation.z = -this.steerVis * clamp(Math.abs(this.speed) / 30, 0, 1) * 0.05;
      this.mesh.rotation.x = clamp(-this.speed * 0.0012, -0.04, 0.04);
      const spin = this.speed * 0.016;
      for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
      // front wheels visibly steer into the turn
      const steerAngle = this.steerVis * 0.42;
      for (const w of this.mesh.userData.frontWheels) {
        // wheels spin on x (rolling) and yaw on y (steering): keep the
        // spin on the mesh's local x by rotating a wrapper is overkill,
        // so steer by yawing the wheel around its own vertical axis via
        // rotation order — approximate with a small y-rotation on top.
        w.rotation.y = steerAngle;
      }
    },
    remove() { scene.remove(this.mesh); },
  };
}
