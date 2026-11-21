// Cars: one low-poly mesh factory, then the three ways a car moves — traffic following the
// avenue grid lane by lane, police hunting the player, and the player's own arcade driving.
// A car's heading is a yaw angle; its forward is (sin h, 0, cos h) and the mesh is built
// facing +z, so mesh.rotation.y = h always.

import { CAR, CITY, POLICE } from './config.js';
import { pick, randRange } from './random.js';
import { resolveCollisions } from './city.js';

export const forwardOf = (h) => ({ x: Math.sin(h), z: Math.cos(h) });

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

export function dist2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

const glassMat = new THREE.MeshLambertMaterial({ color: 0x10151f });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a30 });
const bodyMats = new Map();
function bodyMat(color) {
  if (!bodyMats.has(color)) bodyMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.55 }));
  return bodyMats.get(color);
}

const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 12);
const bodyGeo = new THREE.BoxGeometry(CAR.width, 0.62, CAR.length);
const cabinGeo = new THREE.BoxGeometry(CAR.width * 0.86, 0.55, CAR.length * 0.5);

export function makeCarMesh(color, { police = false } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, police ? bodyMat(0xe8ecf2) : bodyMat(color));
  body.position.y = 0.58;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 1.12, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(CAR.width + 0.02, 0.3, CAR.length * 0.96), bodyMat(0x1c2f57));
    stripe.position.y = 0.52;
    group.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.x = 0.3;
    bar.add(red, blue);
    bar.position.set(0, 1.5, -0.25);
    group.add(bar);
    group.userData.lightbar = { red: red.material, blue: blue.material };
  }
  const wheels = [];
  const steerWheels = [];
  for (const [wx, wz, steer] of [[-0.85, 1.35, 1], [0.85, 1.35, 1], [-0.85, -1.35, 0], [0.85, -1.35, 0]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.37, wz);
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (steer) steerWheels.push(pivot);
  }
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    head.position.set(side * 0.6, 0.66, CAR.length / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tailMat);
    tail.position.set(side * 0.6, 0.7, -CAR.length / 2 - 0.01);
    group.add(tail);
  }
  group.userData.wheels = wheels;
  group.userData.steerWheels = steerWheels;
  return group;
}

function makeCar(color, kind, opts = {}) {
  const mesh = makeCarMesh(color, opts);
  return {
    mesh,
    kind, // 'traffic' | 'parked' | 'police' | 'player'
    heading: 0,
    speed: 0,
    radius: CAR.radius,
    color,
    stolen: false,
    health: 100,
    wheelSpin: 0,
    // traffic route state
    axis: 'z',
    dir: 1,
    targetSpeed: CAR.trafficSpeed,
    nextLine: 0,
  };
}

function placeOnLane(car, rng) {
  // Put a traffic car on a random avenue, in the correct right-hand lane.
  const vertical = rng() < 0.5;
  const line = pick(rng, CITY.lines);
  const dir = rng() < 0.5 ? 1 : -1;
  car.axis = vertical ? 'z' : 'x';
  car.dir = dir;
  const along = randRange(rng, -CITY.extent + 10, CITY.extent - 10);
  if (vertical) {
    car.mesh.position.set(line - dir * CITY.laneOffset, 0, along);
  } else {
    car.mesh.position.set(along, 0, line + dir * CITY.laneOffset);
  }
  car.heading = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  car.speed = CAR.trafficSpeed * randRange(rng, 0.8, 1.1);
  setNextLine(car);
}

function setNextLine(car) {
  const pos = car.mesh.position;
  const along = car.axis === 'z' ? pos.z : pos.x;
  let best = null;
  for (const line of CITY.lines) {
    const d = (line - along) * car.dir;
    if (d > 2 && (best === null || d < best)) best = d;
  }
  car.nextLine = best === null ? Infinity : along + best * car.dir;
}

/** The fixed (lane) coordinate of a car travelling its axis in its direction on road `centre`. */
function laneFixed(axis, dir, centre) {
  return axis === 'z' ? centre - dir * CITY.laneOffset : centre + dir * CITY.laneOffset;
}

export function createTraffic(scene, rng) {
  const cars = [];
  for (let i = 0; i < CAR.trafficCount; i += 1) {
    const car = makeCar(pick(rng, [0xc23b4e, 0x3b6ec2, 0xd8d8dc, 0x2f333a, 0xd9a441, 0x3fae6a, 0x7a4fd0, 0x8c97a5]), 'traffic');
    placeOnLane(car, rng);
    scene.add(car.mesh);
    cars.push(car);
  }

  function update(dt, ctx) {
    const { playerPos } = ctx;
    for (const car of cars) {
      if (car.kind !== 'traffic') continue; // stolen by the player: no longer ours to drive
      const pos = car.mesh.position;
      // Too far from the player: quietly re-enter the grid somewhere nearer.
      if (dist2D(pos.x, pos.z, playerPos.x, playerPos.z) > 190) {
        placeOnLane(car, rng);
        pos.x += Math.sign(playerPos.x - pos.x) * 0; // keep placement simple; grid is dense enough
        if (dist2D(pos.x, pos.z, playerPos.x, playerPos.z) > 190) continue;
      }
      // Obstacle scan: anything solid in my lane ahead slows or stops me.
      const fwd = forwardOf(car.heading);
      let want = CAR.trafficSpeed;
      for (const other of ctx.solids) {
        if (other === car) continue;
        const op = other.mesh ? other.mesh.position : other;
        const rx = op.x - pos.x;
        const rz = op.z - pos.z;
        const ahead = rx * fwd.x + rz * fwd.z;
        const side = rx * -fwd.z + rz * fwd.x;
        if (ahead > 0 && ahead < 13 && Math.abs(side) < 1.7) {
          want = ahead < 6.5 ? 0 : Math.min(want, CAR.trafficSpeed * 0.45);
          break;
        }
      }
      car.speed += Math.sign(want - car.speed) * Math.min(Math.abs(want - car.speed), (want < car.speed ? 22 : 7) * dt);
      const step = car.speed * dt * car.dir;
      if (car.axis === 'z') pos.z += step;
      else pos.x += step;
      // Crossing the next intersection line: sometimes turn onto the cross avenue.
      const along = car.axis === 'z' ? pos.z : pos.x;
      if ((car.dir > 0 && along >= car.nextLine) || (car.dir < 0 && along <= car.nextLine)) {
        const cross = car.nextLine;
        if (Number.isFinite(cross) && rng() < 0.45) {
          const oldAxis = car.axis;
          car.axis = oldAxis === 'z' ? 'x' : 'z';
          car.dir = rng() < 0.5 ? 1 : -1;
          if (car.axis === 'x') {
            // Now travelling along x on the road whose centre is `cross` (a z line).
            pos.z = laneFixed('x', car.dir, cross);
          } else {
            pos.x = laneFixed('z', car.dir, cross);
          }
          car.heading = car.axis === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        }
        setNextLine(car);
      }
      // Keep inside the world: at the last avenue, swing round onto the correct lane back.
      if (Math.abs(pos.x) > CITY.extent - 4 || Math.abs(pos.z) > CITY.extent - 4) {
        car.dir *= -1;
        const snap = (v) => CITY.lines.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), CITY.lines[0]);
        if (car.axis === 'z') pos.x = laneFixed('z', car.dir, snap(pos.x));
        else pos.z = laneFixed('x', car.dir, snap(pos.z));
        car.heading = car.axis === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        setNextLine(car);
      }
      car.mesh.rotation.y = angleLerp(car.mesh.rotation.y, car.heading, dt * 6);
      car.wheelSpin += (car.speed * dt) / 0.37;
      for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
    }
  }

  return { cars, update };
}

/** Parked cars along the curbs — the stealable stock of Vice Harbor. */
export function createParked(scene, rng) {
  const cars = [];
  for (let i = 0; i < CAR.parkedCount; i += 1) {
    const car = makeCar(pick(rng, [0xc23b4e, 0x3b6ec2, 0xd8d8dc, 0x2f333a, 0xd9a441, 0x3fae6a, 0x7a4fd0, 0xe8e8f0, 0x8c97a5, 0x24303c]), 'parked');
    const vertical = rng() < 0.5;
    const line = pick(rng, CITY.lines);
    const side = rng() < 0.5 ? -1 : 1;
    const along = randRange(rng, -CITY.extent + 16, CITY.extent - 16);
    const off = side * (CITY.roadWidth / 2 - 1.7);
    if (vertical) {
      car.mesh.position.set(line + off, 0, along);
      car.heading = side > 0 ? Math.PI : 0;
    } else {
      car.mesh.position.set(along, 0, line + off);
      car.heading = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    car.mesh.rotation.y = car.heading;
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

export function createPolice(scene, rng) {
  const units = [];

  function spawn(playerPos) {
    const unit = makeCar(0xe8ecf2, 'police', { police: true });
    // Appear on an avenue ring around the player, out of immediate sight.
    const angle = rng() * Math.PI * 2;
    let x = playerPos.x + Math.cos(angle) * POLICE.spawnGap;
    let z = playerPos.z + Math.sin(angle) * POLICE.spawnGap;
    x = Math.max(-CITY.extent + 6, Math.min(CITY.extent - 6, x));
    z = Math.max(-CITY.extent + 6, Math.min(CITY.extent - 6, z));
    // Snap to the nearest road centre so units arrive by street, not through towers.
    const snap = (v) => CITY.lines.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), CITY.lines[0]);
    if (Math.abs(x - snap(x)) < Math.abs(z - snap(z))) x = snap(x);
    else z = snap(z);
    unit.mesh.position.set(x, 0, z);
    unit.heading = Math.atan2(playerPos.x - x, playerPos.z - z);
    unit.mesh.rotation.y = unit.heading;
    scene.add(unit.mesh);
    units.push(unit);
    return unit;
  }

  function setWanted(wanted, playerPos) {
    const want = wanted <= 0 ? 0 : Math.min(2 + wanted, 6);
    while (units.length < want) spawn(playerPos);
    for (let i = units.length - 1; i >= 0; i -= 1) {
      if (units.length <= want) break;
      const u = units[i];
      if (dist2D(u.mesh.position.x, u.mesh.position.z, playerPos.x, playerPos.z) > 60) {
        scene.remove(u.mesh);
        units.splice(i, 1);
      }
    }
    // If the heat dies entirely, remaining units give up and leave.
    if (want === 0) {
      for (const u of units) scene.remove(u.mesh);
      units.length = 0;
    }
  }

  function update(dt, ctx) {
    const { target, colliders, time } = ctx;
    let nearest = Infinity;
    for (const unit of units) {
      const pos = unit.mesh.position;
      const d = dist2D(pos.x, pos.z, target.x, target.z);
      nearest = Math.min(nearest, d);
      const desired = Math.atan2(target.x - pos.x, target.z - pos.z);
      unit.heading = angleLerp(unit.heading, desired, dt * 1.7);
      // Close in fast, trail at a car's length, and stop on the bumper: a unit that keeps
      // ramming only wedges both cars together and nobody gets busted or away.
      const cruise = d > 26 ? POLICE.maxSpeed : d > 9 ? POLICE.maxSpeed * 0.55 : d > 5.5 ? 3 : 0;
      unit.speed += Math.sign(cruise - unit.speed) * Math.min(Math.abs(cruise - unit.speed), POLICE.accel * dt);
      const fwd = forwardOf(unit.heading);
      pos.x += fwd.x * unit.speed * dt;
      pos.z += fwd.z * unit.speed * dt;
      resolveCollisions(pos, unit.radius, colliders);
      pos.x = Math.max(-CITY.extent, Math.min(CITY.extent, pos.x));
      pos.z = Math.max(-CITY.extent, Math.min(CITY.extent, pos.z));
      unit.mesh.rotation.y = unit.heading;
      unit.wheelSpin += (unit.speed * dt) / 0.37;
      for (const w of unit.mesh.userData.wheels) w.rotation.x = unit.wheelSpin;
      const bar = unit.mesh.userData.lightbar;
      if (bar) {
        const phase = Math.floor(time * 5) % 2 === 0;
        bar.red.color.setHex(phase ? 0xff2222 : 0x551111);
        bar.blue.color.setHex(phase ? 0x112266 : 0x3366ff);
      }
    }
    return nearest;
  }

  return { units, setWanted, update };
}

/**
 * Advance the player's car one step. input.move() gives throttle (z) and steer (x).
 * Returns the impact speed if this step slammed a building (0 otherwise) so the caller can
 * play the crash and shake the camera.
 */
export function stepDrive(car, input, dt, colliders) {
  const { x: steer, z: throttle } = input.move();
  if (throttle > 0) {
    car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * dt);
  } else if (throttle < 0) {
    car.speed = car.speed > 0.6 ? Math.max(0, car.speed - CAR.brake * dt) : Math.max(-CAR.maxReverse, car.speed - CAR.accel * 0.7 * dt);
  }
  car.speed -= car.speed * CAR.drag * dt * 0.4;
  if (Math.abs(car.speed) < 0.04 && throttle === 0) car.speed = 0;
  const speedRatio = Math.abs(car.speed) / CAR.maxSpeed;
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 6) * (1 - speedRatio * 0.45);
  if (car.speed !== 0) {
    car.heading += steer * CAR.turnRate * steerAuthority * dt * Math.sign(car.speed);
  }
  const before = { x: car.mesh.position.x, z: car.mesh.position.z };
  const fwd = forwardOf(car.heading);
  car.mesh.position.x += fwd.x * car.speed * dt;
  car.mesh.position.z += fwd.z * car.speed * dt;
  car.mesh.position.x = Math.max(-CITY.extent, Math.min(CITY.extent, car.mesh.position.x));
  car.mesh.position.z = Math.max(-CITY.extent, Math.min(CITY.extent, car.mesh.position.z));
  const resolved = resolveCollisions(car.mesh.position, car.radius, colliders);
  const moved = dist2D(before.x, before.z, resolved.x, resolved.z);
  const intended = Math.abs(car.speed) * dt;
  let impact = 0;
  if (intended > 0.01 && moved < intended * 0.45 && Math.abs(car.speed) > 5) {
    impact = Math.abs(car.speed);
    car.speed *= -0.18;
  } else if (intended > 0.01 && moved < intended * 0.6) {
    car.speed *= 0.55;
  }
  car.mesh.rotation.y = car.heading;
  car.wheelSpin += (car.speed * dt) / 0.37;
  for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
  for (const pivot of car.mesh.userData.steerWheels) pivot.rotation.y = steer * 0.42;
  return impact;
}
