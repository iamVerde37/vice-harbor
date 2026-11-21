// The world: everything that exists and everything that happens. It owns the scene's
// lights and sky, the city, the traffic, the police, the pedestrians, the player's body and
// car, the wanted heat, the gunfire, the particles — and it runs the mission machine,
// feeding it positions and taking its orders (set the heat, pay the reward, raise the crew).
// main.js only owns the screens; when the world says the player is busted or wasted, the
// screens answer.

import { CAR, CITY, PALETTE, PLAYER, POLICE, SAVE_KEY, WANTED } from './config.js';
import { createCity, resolveCollisions } from './city.js';
import { createParked, createPolice, createTraffic, dist2D, forwardOf, makeCarMesh, stepDrive } from './cars.js';
import { createPeds, createPickups, createPlayer, createRivals } from './player.js';
import { COUPE_SPOT, createMissions } from './missions.js';

const lerp = (a, b, t) => a + (b - a) * t;

export function createWorld({ scene, rng, audio, hud }) {
  // --- sky and light ---------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbdd7ee, 0x444a55, 0.98);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b3, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const skyDay = new THREE.Color(PALETTE.sky);
  const skyDusk = new THREE.Color(PALETTE.duskSky);
  const fogDay = new THREE.Color(PALETTE.fog);
  const fogDusk = new THREE.Color(0x3a3358);
  scene.background = new THREE.Color().copy(skyDay);
  scene.fog = new THREE.Fog(0x9db8cc, 120, 460);

  const city = createCity(scene, rng);
  const traffic = createTraffic(scene, rng);
  const parked = createParked(scene, rng);
  const police = createPolice(scene, rng);
  const peds = createPeds(scene, rng);
  const pickups = createPickups(scene);
  const player = createPlayer(scene);

  // The pearl-white coupe Marisol wants lifted: parked by Luna Garage, marked in gold.
  const coupe = {
    mesh: makeCarMesh(0xf2f2f5),
    kind: 'parked',
    heading: Math.PI,
    speed: 0,
    radius: CAR.radius,
    color: 0xf2f2f5,
    stolen: false,
    health: 100,
    wheelSpin: 0,
    crimeCd: 0,
  };
  coupe.mesh.position.set(COUPE_SPOT.x, 0, COUPE_SPOT.z);
  coupe.mesh.rotation.y = coupe.heading;
  scene.add(coupe.mesh);

  // A headlight for whatever the player drives, lit at dusk.
  const headlight = new THREE.SpotLight(0xffe9bb, 0, 42, 0.5, 0.5, 1.2);
  scene.add(headlight);
  scene.add(headlight.target);

  // --- particles and tracers ---------------------------------------------------
  const PMAX = 360;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PMAX * 3);
  const pCol = new Float32Array(PMAX * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.95 }));
  points.frustumCulled = false;
  scene.add(points);
  const particles = Array.from({ length: PMAX }, () => ({ life: 0, vx: 0, vy: 0, vz: 0, x: 0, y: -50, z: 0, max: 1 }));
  let pNext = 0;
  const tmpColor = new THREE.Color();
  function burst(x, y, z, color, n, speed = 4, life = 0.6, up = 2.5) {
    tmpColor.setHex(color);
    for (let i = 0; i < n; i += 1) {
      const p = particles[pNext];
      pNext = (pNext + 1) % PMAX;
      const a = rng() * Math.PI * 2;
      const s = speed * (0.3 + rng() * 0.7);
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = up * (0.4 + rng() * 0.8);
      p.life = p.max = life * (0.6 + rng() * 0.7);
      const idx = particles.indexOf(p);
      pCol[idx * 3] = tmpColor.r;
      pCol[idx * 3 + 1] = tmpColor.g;
      pCol[idx * 3 + 2] = tmpColor.b;
    }
    pGeo.attributes.color.needsUpdate = true;
  }
  function updateParticles(dt) {
    for (let i = 0; i < PMAX; i += 1) {
      const p = particles[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 6.5 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.05) p.y = 0.05;
        if (p.life <= 0) p.y = -50;
      }
      pPos[i * 3] = p.x;
      pPos[i * 3 + 1] = p.y;
      pPos[i * 3 + 2] = p.z;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
  function tracer(from, to, color = 0xffe9a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z)]);
    const line = new THREE.Line(geo, tracerMat.clone());
    line.material.color.setHex(color);
    scene.add(line);
    tracers.push({ line, life: 0.06 });
  }
  function updateTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  // --- state -------------------------------------------------------------------
  const state = {
    money: 0,
    wanted: 0,
    mode: 'foot', // 'foot' | 'car'
    busted: false,
    wasted: false,
    storyDone: false,
    dayLabel: 'AFTERNOON',
  };
  let currentCar = null;
  let rivals = null;
  let elapsed = 0;
  let unseenTime = 0;
  let bustTimer = 0;
  let crimeBlip = null; // {x, z, t} — recent noise the pedestrians react to
  let crimeThrottle = 0;
  let camYaw = PLAYER.start.heading;
  let camPitch = 0.32;
  let camDist = 8;
  let policeShotTimer = 0;

  const playerPos = () => (state.mode === 'car' && currentCar ? currentCar.mesh.position : player.pos);
  const playerSpeed = () => (state.mode === 'car' && currentCar ? Math.abs(currentCar.speed) : lastFootSpeed);
  let lastFootSpeed = 0;

  function crime(n, at) {
    if (n <= 0) return;
    state.wanted = Math.min(5, state.wanted + n);
    unseenTime = 0;
    police.setWanted(state.wanted, playerPos());
    if (at) crimeBlip = { x: at.x, z: at.z, t: elapsed };
  }
  function setHeat(n) {
    state.wanted = Math.max(state.wanted, n);
    unseenTime = 0;
    police.setWanted(state.wanted, playerPos());
  }
  function clearHeat() {
    state.wanted = 0;
    unseenTime = 0;
    police.setWanted(0, playerPos());
  }

  // --- missions ------------------------------------------------------------------
  const missions = createMissions(scene, {
    playerPos,
    playerInCar: () => state.mode === 'car',
    playerDrivesMarked: () => currentCar === coupe,
    markedCarPos: () => coupe.mesh.position,
    wanted: () => state.wanted,
    rivalsAlive: () => (rivals ? rivals.aliveCount() : 0),
    onStepStart(index, stepIndex, step) {
      if (index === 1 && step.kind === 'timed') {
        setHeat(2);
        hud.banner('Package aboard', 'The harbour is watching — move!');
      }
      if (index === 2 && step.kind === 'shootout') {
        activateRivals();
        hud.banner('The Marano Crew', 'End the conversation');
      }
      if (index === 2 && step.kind === 'escape') setHeat(3);
    },
    onMissionStart(index) {
      const titles = ['Job 1 — First Wheels', 'Job 2 — Hot Cargo', 'Job 3 — Neon Payback'];
      hud.banner(titles[index], 'Follow the gold marker');
    },
    onMissionComplete(index, reward) {
      state.money += reward;
      audio.success();
      audio.cash();
      hud.banner('Job Complete', `+$${reward} — Marisol is pleased`);
      if (index === 2) state.storyDone = true;
      saveGame();
    },
    onMissionFail() {
      audio.fail();
    },
    onMissionReset(index) {
      resetAfterTrouble();
      if (index === 0 && currentCar !== coupe) {
        coupe.mesh.position.set(COUPE_SPOT.x, 0, COUPE_SPOT.z);
        coupe.heading = Math.PI;
        coupe.mesh.rotation.y = Math.PI;
        coupe.kind = 'parked';
        coupe.stolen = false;
        coupe.speed = 0;
      }
      if (index === 2 && rivals) {
        for (const r of rivals.rivals) scene.remove(r.mesh);
        rivals = null;
      }
    },
    onFreeRoam() {
      hud.banner('Free Roam', 'Vice Harbor is yours');
      saveGame();
    },
  });

  function activateRivals() {
    if (rivals) return;
    rivals = createRivals(scene, [
      { x: 45, z: -38, heading: 2.6 },
      { x: 59, z: -38, heading: -2.6 },
      { x: 52, z: -31, heading: Math.PI },
    ]);
  }

  // --- save / load -----------------------------------------------------------------
  function saveGame() {
    try {
      const p = playerPos();
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: state.money,
        nextMission: state.storyDone ? -1 : missions.missionIndex + 1,
        storyDone: state.storyDone,
        x: p.x,
        z: p.z,
      }));
    } catch {
      // Private windows: the run simply isn't kept.
    }
  }
  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function resetAfterTrouble() {
    clearHeat();
    bustTimer = 0;
    state.busted = false;
    state.wasted = false;
    player.health = Math.max(player.health, 65);
    if (state.mode === 'car') exitCar(true);
  }

  // --- cars: entering, leaving, collisions ------------------------------------------
  function enterableCars() {
    return [...parked, ...traffic.cars, coupe];
  }

  function nearestCar() {
    let best = null;
    let bestD = PLAYER.enterRange;
    for (const car of enterableCars()) {
      if (car === currentCar) continue;
      const d = dist2D(player.pos.x, player.pos.z, car.mesh.position.x, car.mesh.position.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    currentCar = car;
    car.kind = 'player';
    car.speed = 0;
    state.mode = 'car';
    player.mesh.visible = false;
    audio.door();
    if (!car.stolen) {
      car.stolen = true;
      crime(WANTED.steal, car.mesh.position);
      hud.banner('Vehicle Stolen', car === coupe ? 'The coupe is yours — now deliver it' : '+1 star — the harbour noticed', 1.8);
    }
  }

  function exitCar(silent = false) {
    if (!currentCar) return;
    const car = currentCar;
    const fwd = forwardOf(car.heading);
    const rx = -fwd.z;
    const rz = fwd.x;
    player.pos.set(car.mesh.position.x + rx * 2.6, 0, car.mesh.position.z + rz * 2.6);
    resolveCollisions(player.pos, PLAYER.radius, city.colliders);
    player.heading = car.heading;
    car.kind = 'parked';
    car.speed = 0;
    currentCar = null;
    state.mode = 'foot';
    player.mesh.visible = true;
    if (!silent) audio.door();
  }

  function carCollisions(dt) {
    if (state.mode !== 'car' || !currentCar) return;
    const mine = currentCar;
    const others = [...traffic.cars, ...parked, ...police.units, coupe].filter((c) => c !== mine);
    for (const other of others) {
      // Two discs per car, one over each axle. A single disc with the car's half-length
      // as its radius would call a car in the next lane (3.4 m over) a crash — and pin
      // the player at walking pace whenever a police unit pulled alongside.
      const mf = forwardOf(mine.heading);
      const of = forwardOf(other.heading ?? 0);
      let hit = null;
      for (const ms of [-1.15, 1.15]) {
        for (const os of [-1.15, 1.15]) {
          const ax = mine.mesh.position.x + mf.x * ms;
          const az = mine.mesh.position.z + mf.z * ms;
          const bx = other.mesh.position.x + of.x * os;
          const bz = other.mesh.position.z + of.z * os;
          const d = dist2D(ax, az, bx, bz);
          if (d < 2.5 && d > 0.001 && (!hit || d < hit.d)) hit = { d, nx: (bx - ax) / d, nz: (bz - az) / d };
        }
      }
      if (!hit) continue;
      const impact = Math.abs(mine.speed);
      const { nx, nz } = hit;
      const push = (2.5 - hit.d) / 2;
      if (other.kind !== 'police') {
        other.mesh.position.x += nx * push;
        other.mesh.position.z += nz * push;
        if (other.axis !== undefined && other.kind === 'traffic') {
          // A shunted traffic car re-joins its lane grid from where it landed.
          other.mesh.position.x = Math.max(-CITY.extent, Math.min(CITY.extent, other.mesh.position.x));
          other.mesh.position.z = Math.max(-CITY.extent, Math.min(CITY.extent, other.mesh.position.z));
        }
      }
      mine.mesh.position.x -= nx * push * 0.7;
      mine.mesh.position.z -= nz * push * 0.7;
      if (other.kind === 'police') other.speed = 0; // the unit holds its ground instead of shoving through
      // The speed cut, sparks and crime belong to the moment of impact. Grinding contact
      // after that first hit only separates the cars — re-applying the cut every step
      // would bleed a boxed-in player's speed to zero and make every chase a formality.
      const freshHit = elapsed - (other.__lastHit ?? -9) > 0.35;
      if (freshHit && impact > 3) {
        other.__lastHit = elapsed;
        mine.speed *= 0.45;
      }
      if (freshHit && impact > 4) {
        burst(mine.mesh.position.x + nx * 2, 0.8, mine.mesh.position.z + nz * 2, 0xffc46b, 14, 5, 0.5);
        audio.crash(impact > 11);
        crimeBlip = { x: mine.mesh.position.x, z: mine.mesh.position.z, t: elapsed };
        if (crimeThrottle <= 0) {
          crime(other.kind === 'police' ? WANTED.hitPolice : WANTED.hitCar, mine.mesh.position);
          crimeThrottle = 2.5;
        }
      }
    }
    // Running down pedestrians is the harbour's reddest line.
    if (Math.abs(mine.speed) > 2.5) {
      for (const ped of peds.peds) {
        if (ped.state === 'down') continue;
        const d = dist2D(mine.mesh.position.x, mine.mesh.position.z, ped.mesh.position.x, ped.mesh.position.z);
        if (d < 2.7) {
          if (peds.down(ped)) {
            burst(ped.mesh.position.x, 0.7, ped.mesh.position.z, 0xb03a4a, 12, 3.5, 0.6);
            audio.crash(false);
            if (crimeThrottle <= 0) {
              crime(WANTED.hitPed, ped.mesh.position);
              crimeThrottle = 2.5;
            }
          }
        }
      }
    }
  }

  // --- gunfire ----------------------------------------------------------------------
  function shoot() {
    player.shootCd = PLAYER.shootCooldown;
    audio.gunshot();
    const origin = { x: player.pos.x, y: 1.38, z: player.pos.z };
    const dir = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
    crimeBlip = { x: player.pos.x, z: player.pos.z, t: elapsed };
    let bestT = PLAYER.shootRange;
    let hit = null;
    const testCircle = (cx, cz, r, ref, kind) => {
      const ox = cx - origin.x;
      const oz = cz - origin.z;
      const t = ox * dir.x + oz * dir.z;
      if (t < 0.5 || t > bestT) return;
      const px = origin.x + dir.x * t;
      const pz = origin.z + dir.z * t;
      if (Math.hypot(cx - px, cz - pz) < r) {
        bestT = t;
        hit = { ref, kind, x: px, z: pz };
      }
    };
    if (rivals) for (const r of rivals.rivals) if (r.alive) testCircle(r.mesh.position.x, r.mesh.position.z, 0.75, r, 'rival');
    for (const ped of peds.peds) if (ped.state !== 'down') testCircle(ped.mesh.position.x, ped.mesh.position.z, 0.7, ped, 'ped');
    for (const car of [...traffic.cars, ...parked, ...police.units, coupe]) testCircle(car.mesh.position.x, car.mesh.position.z, 2.1, car, 'car');
    const end = { x: origin.x + dir.x * bestT, y: 1.25, z: origin.z + dir.z * bestT };
    const muzzle = { x: origin.x + dir.x * 0.7, y: 1.38, z: origin.z + dir.z * 0.7 };
    tracer(muzzle, end);
    // The first shot itself is a crime if anyone official is near.
    if (crimeThrottle <= 0 && state.wanted < 5) {
      const anyCop = police.units.some((u) => dist2D(u.mesh.position.x, u.mesh.position.z, player.pos.x, player.pos.z) < WANTED.sightRange);
      if (anyCop) {
        crime(1, player.pos);
        crimeThrottle = 2.5;
      }
    }
    if (!hit) return;
    burst(hit.x, 1.1, hit.z, 0xd8d8d8, 5, 2.5, 0.3);
    if (hit.kind === 'rival' && rivals) {
      burst(hit.x, 1.2, hit.z, 0xb03a4a, 8, 3, 0.45);
      if (rivals.hurt(hit.ref, 34)) {
        state.money += 100;
        audio.cash();
        hud.banner('Rival Down', '+$100 — Marisol settles in cash', 1.6);
      }
    } else if (hit.kind === 'ped') {
      if (peds.down(hit.ref)) {
        burst(hit.x, 0.8, hit.z, 0xb03a4a, 10, 3, 0.5);
        crime(WANTED.shootPed, hit.ref.mesh.position);
      }
    } else if (hit.kind === 'car') {
      burst(hit.x, 0.9, hit.z, 0xffc46b, 8, 3.5, 0.35);
      hit.ref.health -= 12;
    }
  }

  // --- the step ------------------------------------------------------------------------
  // `actions` are the one-shot key edges main read this frame (ACTION_ENTER matters here);
  // main keeps pause/confirm for the screens.
  function update(dt, input, camera, actions = 0) {
    elapsed += dt;
    crimeThrottle = Math.max(0, crimeThrottle - dt);
    const focus = playerPos();

    // Daylight drifts from afternoon into neon dusk over the first seven minutes.
    const dusk = Math.min(1, Math.max(0, (elapsed - 200) / 220));
    state.dayLabel = dusk < 0.35 ? 'AFTERNOON' : dusk < 0.8 ? 'GOLDEN HOUR' : 'NEON DUSK';
    const sunAngle = lerp(0.85, 0.13, dusk);
    sun.position.set(focus.x - 120, Math.sin(sunAngle) * 190, focus.z - 60);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.intensity = lerp(1.6, 0.75, dusk);
    sun.color.setHex(dusk > 0.5 ? 0xff9a5e : 0xffe3b3);
    hemi.intensity = lerp(0.98, 0.55, dusk);
    scene.background.copy(skyDay).lerp(skyDusk, dusk);
    scene.fog.color.copy(fogDay).lerp(fogDusk, dusk);
    city.update(dt, elapsed, dusk);

    missions.update(dt, elapsed);

    // Control: on foot or behind the wheel.
    let prompt = null;
    if (state.mode === 'foot') {
      lastFootSpeed = player.update(dt, input, camYaw, city.colliders);
      const near = nearestCar();
      if (near) prompt = '<b>F</b> — Steal the car';
      if (actions & 2 && near) enterCar(near); // ACTION_ENTER
      if (input.firing() && player.shootCd <= 0) {
        player.heading = camYaw;
        shoot();
      }
      audio.setEngine(0, false);
    } else if (currentCar) {
      const impact = stepDrive(currentCar, input, dt, city.colliders);
      if (impact > 0) {
        burst(currentCar.mesh.position.x, 0.7, currentCar.mesh.position.z, 0xffc46b, 16, 5, 0.5);
        audio.crash(impact > 11);
        crimeBlip = { x: currentCar.mesh.position.x, z: currentCar.mesh.position.z, t: elapsed };
      }
      if (actions & 2) exitCar(); // ACTION_ENTER
      prompt = '<b>F</b> — Get out';
      audio.setEngine(currentCar.speed / CAR.maxSpeed, true);
    }
    hud.showPrompt(state.busted || state.wasted ? null : prompt);

    // The living city.
    const solids = [...traffic.cars, ...parked, coupe, ...police.units, { mesh: player.mesh }];
    if (currentCar && !solids.includes(currentCar)) solids.push(currentCar);
    traffic.update(dt, { playerPos: focus, solids });
    carCollisions(dt);
    const threat = crimeBlip && elapsed - crimeBlip.t < 3 ? { x: crimeBlip.x, z: crimeBlip.z, radius: 17 } : null;
    peds.update(dt, threat);
    const nearestCop = police.update(dt, { target: focus, colliders: city.colliders, time: elapsed });
    audio.setSiren(state.wanted > 0 && nearestCop < 60 ? 1 - nearestCop / 70 : 0);
    if (rivals) {
      rivals.update(dt, player.pos, {
        tracer,
        shotSound: () => audio.enemyShot(),
        onPlayerHit: (dmg) => hurtPlayer(dmg),
      });
    }
    pickups.update(elapsed);
    for (const p of pickups.pickups) {
      if (p.taken) continue;
      if (dist2D(focus.x, focus.z, p.mesh.position.x, p.mesh.position.z) < 2.2) {
        p.taken = true;
        p.mesh.visible = false;
        state.money += p.value;
        audio.pickup();
        hud.banner('Cash Stash', `+$${p.value}`, 1.4);
      }
    }

    // Heat: decay when unseen, bust when pinned, shots when desperate.
    if (state.wanted > 0) {
      const seen = nearestCop < WANTED.sightRange;
      if (seen) unseenTime = 0;
      else {
        unseenTime += dt;
        if (unseenTime > WANTED.decayDelay) {
          state.wanted -= 1;
          unseenTime = 0;
          police.setWanted(state.wanted, focus);
          if (state.wanted === 0) hud.banner('Heat Lost', 'The harbour forgets — for now', 1.8);
        }
      }
      if (nearestCop < POLICE.bustRange && playerSpeed() < 1.2) {
        bustTimer += dt;
        if (bustTimer > POLICE.bustTime) state.busted = true;
      } else {
        bustTimer = Math.max(0, bustTimer - dt * 1.5);
      }
      if (state.wanted >= 3) {
        policeShotTimer -= dt;
        if (policeShotTimer <= 0 && nearestCop < POLICE.shootRange && nearestCop > POLICE.bustRange) {
          policeShotTimer = 0.9 + rng() * 0.7;
          const cop = police.units[0];
          if (cop) {
            tracer(
              { x: cop.mesh.position.x, y: 1.3, z: cop.mesh.position.z },
              { x: focus.x, y: 1.1, z: focus.z },
              0xff5544,
            );
            audio.enemyShot();
            if (rng() < 0.5) hurtPlayer(state.mode === 'car' ? POLICE.shootDamage * 0.5 : POLICE.shootDamage);
          }
        }
      }
    }

    updateParticles(dt);
    updateTracers(dt);
    updateCamera(dt, input, camera, dusk);
    headlight.intensity = state.mode === 'car' ? dusk * 260 : 0;
    if (currentCar) {
      const fwd = forwardOf(currentCar.heading);
      headlight.position.set(currentCar.mesh.position.x, 1, currentCar.mesh.position.z);
      headlight.target.position.set(
        currentCar.mesh.position.x + fwd.x * 18,
        0,
        currentCar.mesh.position.z + fwd.z * 18,
      );
    }

    // HUD.
    const objective = missions.objective();
    hud.update(
      {
        money: state.money,
        wanted: state.wanted,
        health: player.health,
        mode: state.mode,
        speedKmh: Math.abs(currentCar ? currentCar.speed : 0) * 3.6,
        dayLabel: state.dayLabel,
        objective,
      },
      {
        blocks: city.blocks,
        player: { x: focus.x, z: focus.z, heading: state.mode === 'car' && currentCar ? currentCar.heading : player.heading },
        traffic: traffic.cars.map((c) => c.mesh.position),
        police: police.units.map((u) => u.mesh.position),
        target: objective ? objective.target : null,
      },
      elapsed,
    );
  }

  function hurtPlayer(dmg) {
    if (state.wasted) return;
    player.health -= dmg;
    hud.damageFlash();
    if (player.health <= 0) {
      player.health = 0;
      state.wasted = true;
    }
  }

  // --- camera ---------------------------------------------------------------------------
  function updateCamera(dt, input, camera, dusk) {
    const mouse = input.takeMouse();
    camYaw -= mouse.dx * 0.0026;
    camPitch = Math.max(0.06, Math.min(0.62, camPitch + mouse.dy * 0.0022));
    const focus = playerPos();
    if (state.mode === 'car' && currentCar) {
      // The camera settles behind the car; the mouse can still look around it.
      let diff = currentCar.heading - camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(mouse.dx) < 1) camYaw += diff * Math.min(1, dt * 2.2);
      camDist = lerp(camDist, 10.5, dt * 3);
    } else {
      camDist = lerp(camDist, 7.5, dt * 3);
    }
    const back = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
    const targetPos = {
      x: focus.x - back.x * camDist * Math.cos(camPitch),
      y: 1.7 + Math.sin(camPitch) * camDist,
      z: focus.z - back.z * camDist * Math.cos(camPitch),
    };
    const clamped = { x: targetPos.x, z: targetPos.z };
    resolveCollisions(clamped, 1.1, city.colliders);
    camera.position.set(clamped.x, Math.max(0.7, targetPos.y), clamped.z);
    camera.lookAt(focus.x + back.x * 3, 1.55, focus.z + back.z * 3);
  }

  return {
    state,
    player,
    missions,
    traffic,
    police,
    peds,
    parked,
    coupe,
    city,
    update,
    /** Directly set the heat (screenshot scenes and scripted beats). */
    setWanted(n) {
      state.wanted = Math.max(0, Math.min(5, n));
      unseenTime = 0;
      police.setWanted(state.wanted, playerPos());
    },
    get camYaw() { return camYaw; },
    setCamYaw(v) { camYaw = v; },
    setCamPitch(v) { camPitch = v; },
    playerPos,
    currentCar: () => currentCar,
    enterCar,
    exitCar,
    activateRivals,
    rivalsRef: () => rivals,
    resetAfterTrouble,
    applyFine(kind) {
      const fine = Math.floor(state.money * (kind === 'busted' ? 0.15 : 0.1));
      state.money -= fine;
      return fine;
    },
    respawn() {
      if (state.mode === 'car') exitCar(true);
      player.pos.set(PLAYER.start.x, 0, PLAYER.start.z);
      player.heading = PLAYER.start.heading;
      camYaw = PLAYER.start.heading;
    },
    saveGame,
    loadSave,
    applySave(save) {
      state.money = save.money ?? 0;
      if (typeof save.x === 'number' && typeof save.z === 'number') {
        player.pos.set(save.x, 0, save.z);
      }
      if (save.storyDone) {
        state.storyDone = true;
        missions.forceFreeRoam();
      } else {
        missions.jumpTo(Math.min(2, Math.max(0, save.nextMission ?? 0)));
      }
    },
  };
}
