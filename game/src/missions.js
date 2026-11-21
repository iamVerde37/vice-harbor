// The story of VICE HARBOR in three jobs. Rico, a getaway driver with a gift and a debt,
// owes fixer Marisol Vega $2,900. Three jobs pay it off: lift a coupe for the Docks, run a
// package across town, then settle a score with the Marano crew at Casino Sol and vanish.
// Steps are small declarative machines (go here, steal that, beat the clock, clear the
// heat); this module owns the objective marker and the step flow, while the world owns the
// consequences (wanted level, rivals, rewards) through the ctx callbacks.

import { REWARDS } from './config.js';

export const STORY_INTRO = {
  title: 'Vice Harbor',
  text: 'Rico drives. That is the whole résumé — and right now it owes Marisol Vega $2,900, due by the end of the week. Marisol is fair, for a fixer: three jobs, no questions, cash on delivery. Do the work, keep your head down when the stars come out, and the harbour is yours again.',
};

export const CARDS = [
  {
    title: 'Job 1 — First Wheels',
    text: 'A pearl-white coupe sits outside Luna Garage, keys in, owner "indisposed". Marisol\'s buyer at the Docks wants it before dark. Lift it clean, deliver it whole.',
  },
  {
    title: 'Job 2 — Hot Cargo',
    text: 'A package waits on Marina Boardwalk. An Uptown buyer pays $900 for it — delivered fast, and the harbour police take a dim view of couriers. Expect company.',
  },
  {
    title: 'Job 3 — Neon Payback',
    text: 'The Marano crew leaned on Marisol\'s casino and put her collector in hospital. Three of them are drinking at Casino Sol tonight. End the conversation, then lose the heat. After this, the debt is paid.',
  },
];

export const FINALE = {
  title: 'Debt Paid',
  text: '$2,900, square. Marisol slides an envelope across the bar: "You drive like the harbour owes you money. Maybe it does now." Vice Harbor is yours, Rico — every avenue, every dock, every neon mile. Free roam: the city keeps turning, and so do the stars.',
};

export const COUPE_SPOT = { x: -124.7, z: -64 };
export const DOCKS = { x: 146, z: 40 };
export const MARINA = { x: -60, z: 138 };
export const BUYER = { x: 60, z: -128 };
export const PLAZA = { x: 52, z: -40 };

function stepsFor(index) {
  if (index === 0) {
    return [
      { kind: 'goto', x: COUPE_SPOT.x, z: COUPE_SPOT.z, radius: 7, text: 'Steal the pearl-white coupe outside Luna Garage' },
      { kind: 'steal', text: 'Get in the coupe (F, up close)' },
      { kind: 'deliver', x: DOCKS.x, z: DOCKS.z, radius: 8, text: 'Deliver the coupe to the Docks, pier 2' },
    ];
  }
  if (index === 1) {
    return [
      { kind: 'pickup', x: MARINA.x, z: MARINA.z, radius: 2.6, text: 'Pick up the package on Marina Boardwalk (on foot)' },
      { kind: 'timed', x: BUYER.x, z: BUYER.z, radius: 8, seconds: 100, text: 'Drive the package to the Uptown buyer' },
    ];
  }
  return [
    { kind: 'goto', x: PLAZA.x, z: PLAZA.z, radius: 10, text: 'Show up at Casino Sol — the Marano crew is waiting' },
    { kind: 'shootout', text: 'Take down the Marano crew' },
    { kind: 'escape', text: 'Lose the heat — break line of sight and stay clean' },
  ];
}

export function createMissions(scene, ctx) {
  // The objective marker: a pillar of gold light and a turning ring.
  const marker = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 16, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.33, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 8;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.12, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  marker.add(pillar, ring);
  marker.visible = false;
  scene.add(marker);
  // A chevron that hovers over the car a step wants stolen.
  const chevron = new THREE.Mesh(
    new THREE.ConeGeometry(0.85, 1.5, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
  );
  chevron.rotation.x = Math.PI;
  chevron.visible = false;
  scene.add(chevron);

  let phase = 'card'; // 'card' | 'run' | 'failed' | 'free'
  let card = STORY_INTRO;
  let cardThenMission = 0; // after the intro card, job 1 begins; cards[i] precede mission i
  let missionIndex = 0;
  let steps = stepsFor(0);
  let stepIndex = 0;
  let timeLeft = 0;
  let failReason = '';

  function currentStep() {
    return steps[stepIndex] ?? null;
  }

  function startStep() {
    const step = currentStep();
    timeLeft = step && step.kind === 'timed' ? step.seconds : 0;
    if (step) ctx.onStepStart(missionIndex, stepIndex, step);
  }

  function completeMission() {
    const reward = REWARDS[missionIndex];
    ctx.onMissionComplete(missionIndex, reward);
    if (missionIndex >= 2) {
      card = FINALE;
      cardThenMission = -1; // finale: free roam after
      phase = 'card';
    } else {
      missionIndex += 1;
      card = CARDS[missionIndex];
      cardThenMission = missionIndex;
      phase = 'card';
    }
  }

  function advance() {
    stepIndex += 1;
    if (stepIndex >= steps.length) completeMission();
    else startStep();
  }

  return {
    get phase() { return phase; },
    get card() { return card; },
    get missionIndex() { return missionIndex; },
    get failReason() { return failReason; },
    get timeLeft() { return timeLeft; },

    /** The player dismissed a story card: begin (or resume) the job it introduced. */
    dismissCard() {
      if (phase !== 'card') return;
      if (cardThenMission === -1) {
        phase = 'free';
        ctx.onFreeRoam();
        return;
      }
      missionIndex = cardThenMission;
      steps = stepsFor(missionIndex);
      stepIndex = 0;
      phase = 'run';
      ctx.onMissionStart(missionIndex);
      startStep();
    },

    fail(reason) {
      if (phase !== 'run') return;
      phase = 'failed';
      failReason = reason;
      ctx.onMissionFail(missionIndex, reason);
    },

    /** Restart the current job from its first step (after a bust, a wreck or a timeout). */
    retry() {
      steps = stepsFor(missionIndex);
      stepIndex = 0;
      phase = 'run';
      ctx.onMissionReset(missionIndex);
      startStep();
    },

    /** Land in free roam directly (a Continue save whose story is already done). */
    forceFreeRoam() {
      phase = 'free';
    },

    /** Jump straight into a job (used by Continue saves and the screenshot scenes). */
    jumpTo(index) {
      missionIndex = index;
      steps = stepsFor(index);
      stepIndex = 0;
      phase = 'run';
      ctx.onMissionStart(index);
      startStep();
    },

    objective() {
      if (phase === 'free') return { title: 'Free Roam', text: 'The harbour is yours — cruise, collect stashes, outrun the stars', target: null, dist: 0 };
      if (phase !== 'run') return null;
      const step = currentStep();
      if (!step) return null;
      const title = `Job ${missionIndex + 1} of 3`;
      let target = null;
      if (step.kind === 'steal') target = ctx.markedCarPos();
      else if (step.x !== undefined) target = { x: step.x, z: step.z };
      let text = step.text;
      if (step.kind === 'shootout') text = `${step.text} — ${ctx.rivalsAlive()} left`;
      if (step.kind === 'timed') text = `${step.text} — ${Math.max(0, Math.ceil(timeLeft))}s`;
      const p = ctx.playerPos();
      const dist = target ? Math.hypot(p.x - target.x, p.z - target.z) : 0;
      return { title, text, target, dist };
    },

    update(dt, t) {
      const step = phase === 'run' ? currentStep() : null;
      // Place the marker on whatever the step points at.
      let markAt = null;
      if (step) {
        if (step.kind === 'steal') markAt = ctx.markedCarPos();
        else if (step.x !== undefined) markAt = { x: step.x, z: step.z };
      }
      marker.visible = !!markAt && step.kind !== 'steal';
      chevron.visible = !!markAt && step.kind === 'steal';
      if (markAt) {
        marker.position.set(markAt.x, 0, markAt.z);
        ring.rotation.z = t * 1.8;
        const bob = 2.6 + Math.sin(t * 3) * 0.35;
        chevron.position.set(markAt.x, bob, markAt.z);
      }
      if (!step) return;
      const p = ctx.playerPos();
      const distTo = (x, z) => Math.hypot(p.x - x, p.z - z);
      switch (step.kind) {
        case 'goto':
          if (distTo(step.x, step.z) < step.radius) advance();
          break;
        case 'pickup':
          if (!ctx.playerInCar() && distTo(step.x, step.z) < step.radius) advance();
          break;
        case 'steal':
          if (ctx.playerDrivesMarked()) advance();
          break;
        case 'deliver':
          if (ctx.playerDrivesMarked() && distTo(step.x, step.z) < step.radius) advance();
          break;
        case 'timed': {
          timeLeft -= dt;
          if (distTo(step.x, step.z) < step.radius) advance();
          else if (timeLeft <= 0) this.fail('Out of time — the buyer walked.');
          break;
        }
        case 'shootout':
          if (ctx.rivalsAlive() <= 0) advance();
          break;
        case 'escape':
          if (ctx.wanted() <= 0) advance();
          break;
        default:
          break;
      }
    },
  };
}
