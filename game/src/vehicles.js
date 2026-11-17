// SOLARA HEAT — vehicles
// Car meshes and arcade driving. One car model serves Leo, the traffic and
// the police; the physics stays simple (throttle, steering that grows with
// speed, drag, push-out from walls) and feels right at 60 fps.

import * as THREE from 'three';
import { clampNum } from './config.js';

const tyreGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2a38 });
const trimMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const rearMat = new THREE.MeshBasicMaterial({ color: 0xd02020 });

export function makeCarMesh(paint, cop) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  const bonnet = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.9), bodyMat);
  bonnet.position.set(0, 0.95, 1.7);
  g.add(bonnet);
  // Headlights up front, tail lights at the back.
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), headMat);
    hl.position.set(sx, 0.66, 2.22);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), rearMat);
    tl.position.set(sx, 0.66, -2.22);
    g.add(tl);
  }
  const wheels = [];
  const steered = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(tyreGeo, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
    if (wz > 0) steered.push(w);
  }
  // Brake lights flare under braking; otherwise they sit dim.
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x881010 });
  for (const sx of [-0.7, 0.7]) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), brakeMat);
    bl.position.set(sx, 0.66, -2.22);
    g.add(bl);
  }
  if (cop) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.4), trimMat);
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
    g.userData.lampRed = red;
    g.userData.lampBlue = blue;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.78;
    g.add(stripe);
  }
  g.userData.wheels = wheels;
  g.userData.steered = steered;
  g.userData.brakeMat = brakeMat;
  return g;
}

// Arcade car state. x/z in metres, heading in radians (0 = -z, north).
export function spawnCar(scene, x, z, heading, paint, cop) {
  const mesh = makeCarMesh(paint, cop);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh, x, z, heading,
    speed: 0,
    paint, cop: !!cop,
    hp: 100,
    steerVis: 0,
    braking: false,
    // Light the brake lights. Whoever drives this car calls it.
    brake(on) {
      this.braking = on;
      this.mesh.userData.brakeMat.color.setHex(on ? 0xff3030 : 0x881010);
    },
    // One fixed step: throttle -1..1, steering -1..1, brake, top speed.
    driveStep(dt, gas, wheel, brake, top) {
      const cap = top || 34;
      const push = gas > 0 ? 16 : 9;
      this.speed += gas * push * dt;
      if (brake) this.speed -= Math.sign(this.speed) * 26 * dt;
      // Drag and rolling resistance.
      this.speed -= this.speed * 0.55 * dt;
      if (Math.abs(this.speed) < 0.05 && gas === 0) this.speed = 0;
      this.speed = clampNum(this.speed, -10, cap);
      const turn = wheel * clampNum(Math.abs(this.speed) / 9, 0, 1) * 1.9;
      this.heading += turn * dt * Math.sign(this.speed || 1);
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      this.steerVis = wheel;
      this.brake(!!brake);
      this.refresh();
    },
    refresh() {
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.heading;
      // A little body roll and pitch sells the speed.
      this.mesh.rotation.z = -this.steerVis * clampNum(Math.abs(this.speed) / 30, 0, 1) * 0.05;
      this.mesh.rotation.x = clampNum(-this.speed * 0.0012, -0.04, 0.04);
      const spin = this.speed * 0.016;
      for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
      // The front wheels visibly turn into the corner.
      const yaw = this.steerVis * 0.42;
      for (const w of this.mesh.userData.steered) w.rotation.y = yaw;
    },
    drop() { scene.remove(this.mesh); },
  };
}
