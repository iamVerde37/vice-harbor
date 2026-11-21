// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one stages the real
// game — real traffic, real police, the real first job — and plays it forward with fixed
// steps and scripted hands, so the frame is honest gameplay and the same seed always gives
// the same frame. main.js paints it twice and sets window.__shotReady.

import { STEP } from './config.js';
import { COUPE_SPOT } from './missions.js';

const IDLE = { x: 0, z: 0 };
const DRIVE = { x: 0, z: 1 };

function fakeInput(move) {
  return {
    move: () => move,
    run: () => false,
    firing: () => false,
    takeMouse: () => ({ dx: 0, dy: 0 }),
    takeActions: () => 0,
    locked: () => false,
    unlock: () => {},
  };
}

function run(world, camera, seconds, move) {
  const input = fakeInput(move);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.update(STEP, input, camera, 0);
}

/** Put the player beside a car and into its seat, wherever the scene needs them. */
function seatPlayer(world, car, x, z, heading) {
  car.mesh.position.set(x, 0, z);
  car.heading = heading;
  car.mesh.rotation.y = heading;
  car.speed = 0;
  world.player.pos.set(x + 2.5, 0, z + 1.5);
  world.enterCar(car);
  world.setCamYaw(heading);
}

export function stageShot(name, world, camera) {
  const { player, coupe, missions } = world;
  if (name === 'drive') {
    missions.dismissCard(); // Job 1 begins: the objective banner is part of the frame
    // Steal the coupe where it really sits, outside Luna Garage, and pull away north.
    player.pos.set(COUPE_SPOT.x + 2.5, 0, COUPE_SPOT.z + 1.5);
    world.enterCar(coupe);
    coupe.speed = 5; // already rolling as the frame starts
    world.setCamYaw(coupe.heading);
    world.setCamPitch(0.26);
    // A short pull-away: the harbour's finest spawn a block off and need a moment to
    // arrive, so the frame stays about the drive instead of the pile-up that follows.
    run(world, camera, 1.5, DRIVE);
    return { hud: true };
  }
  if (name === 'chase') {
    const car = world.parked[3] ?? world.parked[0];
    seatPlayer(world, car, -30, 29.4, Math.PI / 2); // eastbound lane of the avenue at z=26
    car.speed = 13;
    world.setWanted(3);
    world.setCamPitch(0.24);
    run(world, camera, 2.2, DRIVE);
    // The pursuit AI spawns its units on a ring and the fast ones trail behind the
    // camera, so the frame borrows one real unit and puts it on the intercept course
    // it would take at the next junction — head-on, lightbar lit, closing fast.
    const unit = world.police.units[0];
    if (unit) {
      const p = car.mesh.position;
      unit.mesh.position.set(p.x + 34, 0, p.z - 3.6);
      unit.heading = -Math.PI / 2;
      unit.mesh.rotation.y = unit.heading;
      unit.speed = 8;
    }
    run(world, camera, 0.55, DRIVE);
    return { hud: true };
  }
  if (name === 'mission') {
    missions.dismissCard();
    player.pos.set(COUPE_SPOT.x + 4.5, 0, COUPE_SPOT.z + 5.5);
    player.heading = Math.atan2(COUPE_SPOT.x - player.pos.x, COUPE_SPOT.z - player.pos.z);
    player.mesh.rotation.y = player.heading;
    world.setCamYaw(player.heading);
    run(world, camera, 0.8, IDLE);
    return { hud: true };
  }
  // 'start' (and anything else): the title vista — street level on the x=-26 avenue,
  // looking north through downtown to the VICE HARBOR gantry, traffic rolling underneath.
  run(world, camera, 2.2, IDLE);
  camera.position.set(-26, 4.2, 92);
  camera.lookAt(-20, 10, -90);
  return { hud: false };
}
