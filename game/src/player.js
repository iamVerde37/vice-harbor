// People: low-poly box figures with swinging limbs — the player on foot, the pedestrians
// who stroll the sidewalks (and flee or fall when the day goes wrong), the rival crew who
// shoot back in the finale, and the cash pickups scattered around the harbour.

import { CITY, PED_COLORS, PLAYER } from './config.js';
import { pick, randRange } from './random.js';
import { resolveCollisions } from './city.js';

const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x22242c });

function limb(mat, w, h, d, px, py, pz) {
  const pivot = new THREE.Group();
  pivot.position.set(px, py, pz);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.y = -h / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

export function makePersonMesh(shirtColor, pantsColor = 0x2c3140, { cap = 0x181a20 } = {}) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 0.3), shirt);
  torso.position.y = 1.13;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skinMat);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  const capMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), new THREE.MeshLambertMaterial({ color: cap }));
  capMesh.position.y = 1.85;
  group.add(capMesh);
  const legL = limb(pants, 0.2, 0.8, 0.24, -0.14, 0.82, 0);
  const legR = limb(pants, 0.2, 0.8, 0.24, 0.14, 0.82, 0);
  const armL = limb(shirt, 0.15, 0.66, 0.18, -0.36, 1.42, 0);
  const armR = limb(shirt, 0.15, 0.66, 0.18, 0.36, 1.42, 0);
  group.add(legL, legR, armL, armR);
  group.userData.limbs = { legL, legR, armL, armR };
  return group;
}

/** Swing the limbs for a walker at `phase`; aimPose raises the right arm to hold a gun. */
export function posePerson(mesh, phase, moving, aimPose = false) {
  const { legL, legR, armL, armR } = mesh.userData.limbs;
  const swing = moving ? Math.sin(phase) * 0.62 : 0;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = aimPose ? -Math.PI / 2 + 0.12 : swing * 0.8;
}

export function createPlayer(scene) {
  const mesh = makePersonMesh(0xff3d7e, 0x232733, { cap: 0x28e6ff });
  mesh.position.set(PLAYER.start.x, 0, PLAYER.start.z);
  scene.add(mesh);
  return {
    mesh,
    heading: PLAYER.start.heading,
    health: PLAYER.maxHealth,
    walkPhase: 0,
    shootCd: 0,
    get pos() {
      return mesh.position;
    },
    /** Advance on foot. camYaw is where the camera looks; returns current speed. */
    update(dt, input, camYaw, colliders) {
      const { x, z } = input.move();
      let speed = 0;
      if (x !== 0 || z !== 0) {
        const fx = Math.sin(camYaw);
        const fz = Math.cos(camYaw);
        const rx = -fz;
        const rz = fx;
        let dx = fx * z + rx * x;
        let dz = fz * z + rz * x;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.heading += diff * Math.min(1, dt * 14);
        mesh.position.x += dx * speed * dt;
        mesh.position.z += dz * speed * dt;
        this.walkPhase += dt * speed * 2.1;
      }
      resolveCollisions(mesh.position, PLAYER.radius, colliders);
      mesh.position.x = Math.max(-CITY.extent, Math.min(CITY.extent, mesh.position.x));
      mesh.position.z = Math.max(-CITY.extent, Math.min(CITY.extent, mesh.position.z));
      mesh.rotation.y = this.heading;
      posePerson(mesh, this.walkPhase, speed > 0, input.firing());
      this.shootCd = Math.max(0, this.shootCd - dt);
      return speed;
    },
  };
}

// ---------------------------------------------------------------------------

function sidewalkSpawn(rng) {
  const vertical = rng() < 0.5;
  const line = CITY.lines[Math.floor(rng() * CITY.lines.length)];
  const side = rng() < 0.5 ? -1 : 1;
  const off = side * (CITY.roadWidth / 2 + 1.7);
  const along = randRange(rng, -CITY.extent + 8, CITY.extent - 8);
  return {
    axis: vertical ? 'z' : 'x',
    dir: rng() < 0.5 ? 1 : -1,
    fixed: line + off,
    along,
  };
}

export function createPeds(scene, rng) {
  const peds = [];
  for (let i = 0; i < 22; i += 1) {
    const mesh = makePersonMesh(pick(rng, PED_COLORS), pick(rng, [0x2c3140, 0x4a3b30, 0x39424e, 0x5c5142]));
    const s = sidewalkSpawn(rng);
    if (s.axis === 'z') mesh.position.set(s.fixed, 0, s.along);
    else mesh.position.set(s.along, 0, s.fixed);
    scene.add(mesh);
    peds.push({
      mesh,
      ...s,
      speed: randRange(rng, 1.1, 1.8),
      state: 'walk', // 'walk' | 'flee' | 'down'
      timer: 0,
      phase: randRange(rng, 0, 6),
      fleeFrom: null,
    });
  }

  function update(dt, threat) {
    for (const ped of peds) {
      const pos = ped.mesh.position;
      if (ped.state === 'down') {
        ped.timer -= dt;
        if (ped.timer <= 0) {
          // Quietly back on their feet across town.
          const s = sidewalkSpawn(rng);
          Object.assign(ped, s, { state: 'walk' });
          ped.mesh.rotation.x = 0;
          if (s.axis === 'z') pos.set(s.fixed, 0, s.along);
          else pos.set(s.along, 0, s.fixed);
        }
        continue;
      }
      if (threat && ped.state === 'walk') {
        const d = Math.hypot(pos.x - threat.x, pos.z - threat.z);
        if (d < threat.radius) {
          ped.state = 'flee';
          ped.timer = randRange(rng, 3.5, 6);
          ped.fleeFrom = { x: threat.x, z: threat.z };
        }
      }
      if (ped.state === 'flee') {
        ped.timer -= dt;
        const dx = pos.x - ped.fleeFrom.x;
        const dz = pos.z - ped.fleeFrom.z;
        const len = Math.hypot(dx, dz) || 1;
        pos.x += (dx / len) * 4.6 * dt;
        pos.z += (dz / len) * 4.6 * dt;
        ped.mesh.rotation.y = Math.atan2(dx, dz);
        ped.phase += dt * 11;
        posePerson(ped.mesh, ped.phase, true);
        if (ped.timer <= 0) {
          ped.state = 'walk';
          const s = sidewalkSpawn(rng);
          ped.axis = s.axis;
          ped.dir = s.dir;
          ped.fixed = s.fixed;
        }
        continue;
      }
      // Amble along the sidewalk; at an intersection, sometimes cross to another.
      ped.along += ped.dir * ped.speed * dt;
      if (ped.along > CITY.extent - 6) ped.dir = -1;
      if (ped.along < -CITY.extent + 6) ped.dir = 1;
      for (const line of CITY.lines) {
        if (Math.abs(ped.along - line) < 0.4 && rng() < 0.012) {
          ped.axis = ped.axis === 'z' ? 'x' : 'z';
          const crossOff = (rng() < 0.5 ? -1 : 1) * (CITY.roadWidth / 2 + 1.7);
          ped.along = ped.axis === 'x' ? pos.x : pos.z;
          ped.fixed = line + crossOff;
          break;
        }
      }
      if (ped.axis === 'z') pos.set(ped.fixed, 0, ped.along);
      else pos.set(ped.along, 0, ped.fixed);
      ped.mesh.rotation.y = ped.axis === 'z' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      ped.phase += dt * ped.speed * 2.4;
      posePerson(ped.mesh, ped.phase, true);
    }
  }

  /** Knock a pedestrian down (car impact or gunfire). Returns false if already down. */
  function down(ped, seconds = 25) {
    if (ped.state === 'down') return false;
    ped.state = 'down';
    ped.timer = seconds;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.22;
    return true;
  }

  return { peds, update, down };
}

// ---------------------------------------------------------------------------

export function createRivals(scene, spots) {
  const rivals = spots.map(({ x, z, heading }) => {
    const mesh = makePersonMesh(0x7a1f2b, 0x1d1f26, { cap: 0x101014 });
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.55), darkMat);
    gun.position.set(0.36, 1.32, 0.3);
    mesh.add(gun);
    return { mesh, health: 60, alive: true, shootTimer: randRange(Math.random, 0.8, 1.6), phase: randRange(Math.random, 0, 6) };
  });

  return {
    rivals,
    aliveCount() {
      return rivals.filter((r) => r.alive).length;
    },
    /** Rivals face the player and shoot in bursts; onHit(dmg) applies a landed shot. */
    update(dt, playerPos, fx) {
      for (const rival of rivals) {
        if (!rival.alive) continue;
        const pos = rival.mesh.position;
        const d = Math.hypot(playerPos.x - pos.x, playerPos.z - pos.z);
        rival.mesh.rotation.y = Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z);
        posePerson(rival.mesh, rival.phase, false, d < 30);
        if (d > 30 || d < 2.5) continue;
        rival.shootTimer -= dt;
        if (rival.shootTimer <= 0) {
          rival.shootTimer = randRange(Math.random, 0.9, 1.7);
          const from = { x: pos.x, y: 1.35, z: pos.z };
          const to = { x: playerPos.x, y: 1.2, z: playerPos.z };
          fx.tracer(from, to, 0xff5544);
          fx.shotSound(false);
          if (Math.random() < 0.42) fx.onPlayerHit(6);
        }
      }
    },
    hurt(rival, dmg) {
      rival.health -= dmg;
      if (rival.health <= 0 && rival.alive) {
        rival.alive = false;
        rival.mesh.rotation.x = -Math.PI / 2;
        rival.mesh.position.y = 0.22;
        return true;
      }
      return false;
    },
  };
}

// ---------------------------------------------------------------------------

const STASH_SPOTS = [
  { x: -52, z: 96 },
  { x: 138, z: 18 },
  { x: -104, z: 146 },
  { x: -40, z: 40 },
  { x: 96, z: -96 },
  { x: 40, z: -64 },
];

export function createPickups(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x2fae5f, emissive: 0x0d5c2a });
  const band = new THREE.MeshBasicMaterial({ color: 0xd8ffd8 });
  const pickups = STASH_SPOTS.map(({ x, z }) => {
    const mesh = new THREE.Group();
    const bundle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.38), mat);
    bundle.castShadow = true;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.21, 0.1), band);
    mesh.add(bundle, strap);
    mesh.position.set(x, 0.65, z);
    scene.add(mesh);
    return { mesh, taken: false, value: 150, baseY: 0.65 };
  });
  return {
    pickups,
    update(t) {
      for (const p of pickups) {
        if (p.taken) continue;
        p.mesh.rotation.y = t * 1.6;
        p.mesh.position.y = p.baseY + Math.sin(t * 2.4 + p.mesh.position.x) * 0.12;
      }
    },
  };
}
