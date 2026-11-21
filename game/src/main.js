// VICE HARBOR — boot and screens. The world (world.js) simulates; this file owns the
// renderer's loop and the screen flow: title → story card → play, with pause, and the
// busted / wasted / job-failed endings. The world advances in fixed 1/60 s steps however
// fast the display runs.
//
// ?seed=N fixes the city and traffic. ?shot=start|drive|chase|mission (with &seed=N)
// stages that scene for a screenshot instead of running the game (see shots.js).

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createWorld } from './world.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(-100, 22, 14);
camera.lookAt(20, 4, -52);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const rng = createRandom(seed);
const audio = createAudio();
const hud = createHud();
const input = createInput(canvas);
const world = createWorld({ scene, rng, audio, hud });

const $ = (id) => document.getElementById(id);
const overlays = {
  title: $('title-screen'),
  card: $('story-card'),
  pause: $('pause-screen'),
  end: $('end-screen'),
};
function announce(message) {
  status.textContent = message;
}

const idleInput = {
  move: () => ({ x: 0, z: 0 }),
  run: () => false,
  firing: () => false,
  takeMouse: () => ({ dx: 0, dy: 0 }),
  takeActions: () => 0,
  locked: () => false,
  unlock: () => {},
};

function runShot(name) {
  const result = stageShot(name, world, camera);
  if (result.hud) document.body.classList.add('playing');
  else overlays.title.classList.add('show');
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = 'title'; // 'title' | 'card' | 'play' | 'pause' | 'end'
  let attract = true;
  let accumulator = 0;
  let last = performance.now();
  let wasLocked = false;

  const save = world.loadSave();
  if (save) $('btn-continue').style.display = '';

  function showCard() {
    const card = world.missions.card;
    $('card-title').textContent = card.title;
    $('card-text').textContent = card.text;
    overlays.card.classList.add('show');
    screen = 'card';
    announce(`${card.title}. ${card.text}`);
  }

  function dismissCard() {
    overlays.card.classList.remove('show');
    world.missions.dismissCard();
    attract = false;
    screen = 'play';
    document.body.classList.add('playing');
  }

  function startNew() {
    audio.unlock();
    audio.click();
    audio.startMusic();
    overlays.title.classList.remove('show');
    showCard();
  }

  function continueGame() {
    audio.unlock();
    audio.click();
    audio.startMusic();
    world.applySave(save);
    overlays.title.classList.remove('show');
    attract = false;
    screen = 'play';
    document.body.classList.add('playing');
    announce('Welcome back to Vice Harbor.');
  }

  function pauseGame() {
    if (screen !== 'play') return;
    screen = 'pause';
    overlays.pause.classList.add('show');
    input.unlock();
    announce('Paused.');
  }

  function resumeGame() {
    overlays.pause.classList.remove('show');
    screen = 'play';
    announce('Playing.');
  }

  function showEnd(kind) {
    screen = 'end';
    input.unlock();
    const primary = $('btn-end');
    if (kind === 'failed') {
      $('end-title').textContent = 'JOB FAILED';
      $('end-title').style.color = '';
      $('end-text').textContent = world.missions.failReason;
      primary.textContent = 'Try the job again';
      primary.onclick = () => {
        audio.click();
        overlays.end.classList.remove('show');
        world.missions.retry();
        screen = 'play';
      };
      announce(`Job failed. ${world.missions.failReason}`);
    } else {
      const fine = world.applyFine(kind);
      const busted = kind === 'busted';
      $('end-title').textContent = busted ? 'BUSTED' : 'WASTED';
      $('end-title').style.color = busted ? '#5ea0ff' : '#ff3d5e';
      $('end-text').textContent = busted
        ? `Pinned by the harbour police. The fine and the impound cost you $${fine.toLocaleString('en-US')}.`
        : `You wake up outside St. Marina Hospital, lighter by $${fine.toLocaleString('en-US')} in fees.`;
      const inJob = world.missions.phase === 'run';
      primary.textContent = inJob ? 'Restart the job' : 'Back on the street';
      primary.onclick = () => {
        audio.click();
        overlays.end.classList.remove('show');
        if (inJob) world.missions.retry();
        else {
          world.resetAfterTrouble();
          world.respawn();
        }
        screen = 'play';
      };
      announce(busted ? 'Busted.' : 'Wasted.');
    }
    overlays.end.classList.add('show');
  }

  $('btn-new').addEventListener('click', startNew);
  $('btn-continue').addEventListener('click', continueGame);
  $('btn-story').addEventListener('click', () => {
    audio.click();
    dismissCard();
  });
  $('btn-resume').addEventListener('click', () => {
    audio.click();
    resumeGame();
  });
  $('btn-save-title').addEventListener('click', () => {
    world.saveGame();
    window.location.reload();
  });
  $('btn-end-title').addEventListener('click', () => window.location.reload());

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) wasLocked = true;
    else if (wasLocked) {
      wasLocked = false;
      if (screen === 'play') pauseGame();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') pauseGame();
  });

  overlays.title.classList.add('show');
  announce('Vice Harbor. Choose New Game or Continue.');

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    const actions = input.takeActions();

    if (screen === 'play') {
      if (actions & ACTION_PAUSE) {
        pauseGame();
      } else {
        accumulator += dt;
        let first = true;
        while (accumulator >= STEP && screen === 'play') {
          world.update(STEP, input, camera, first ? actions : 0);
          first = false;
          accumulator -= STEP;
          if (world.state.busted || world.state.wasted) break;
        }
        if (world.state.busted) showEnd('busted');
        else if (world.state.wasted) showEnd('wasted');
        else if (world.missions.phase === 'failed') showEnd('failed');
        else if (world.missions.phase === 'card') showCard();
      }
    } else if (screen === 'card') {
      if (actions & ACTION_CONFIRM) dismissCard();
      else if (attract) {
        accumulator += dt;
        while (accumulator >= STEP) {
          world.setCamYaw(world.camYaw + STEP * 0.045);
          world.update(STEP, idleInput, camera, 0);
          accumulator -= STEP;
        }
      }
    } else if (screen === 'title') {
      accumulator += dt;
      while (accumulator >= STEP) {
        world.setCamYaw(world.camYaw + STEP * 0.045);
        world.update(STEP, idleInput, camera, 0);
        accumulator -= STEP;
      }
    } else if (screen === 'pause') {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) resumeGame();
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
