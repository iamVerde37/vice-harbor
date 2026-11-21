// VICE HARBOR — every tuning number in one place.
// Units are metres and seconds. The city is a square grid of avenues: road centre lines sit at
// CITY.lines on both axes, blocks fill the gaps, and the harbour (water, docks) runs down the
// east edge. Nothing below depends on the window size.

/** The simulation's fixed step: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const CITY = {
  lines: [-130, -78, -26, 26, 78, 130], // road centre coordinates on x and z
  roadWidth: 14,
  laneOffset: 3.4, // distance from a road's centre line to each driving lane
  extent: 152, // playable half-extent; past this the harbour water / city edge stops you
  blockInset: 4, // sidewalk + margin between a road's edge and its buildings
};

/** Where the districts sit, for objective text and flavour. */
export const DISTRICTS = [
  { name: 'the Docks', x: 146, z: 40 },
  { name: 'Marina Boardwalk', x: -60, z: 138 },
  { name: 'Uptown', x: 60, z: -128 },
  { name: 'Casino Row', x: 52, z: -52 },
  { name: 'Luna Garage', x: -124, z: -70 },
  { name: 'Old Market', x: -52, z: 52 },
];

export const PLAYER = {
  radius: 0.55,
  walkSpeed: 3.4,
  runSpeed: 6.4,
  maxHealth: 100,
  start: { x: -118, z: -52, heading: Math.PI / 2 },
  shootCooldown: 0.22,
  shootRange: 70,
  enterRange: 4.2,
};

export const CAR = {
  length: 4.3,
  width: 1.95,
  radius: 2.35,
  maxSpeed: 34, // ~122 km/h for the player's car
  maxReverse: 9,
  accel: 13,
  brake: 26,
  drag: 0.55,
  turnRate: 1.65, // radians a second at full lock, scaled down as speed rises
  trafficSpeed: 10.5,
  trafficCount: 14,
  parkedCount: 16,
};

export const POLICE = {
  maxSpeed: 33,
  accel: 15,
  spawnGap: 62, // how far from the player a fresh unit appears
  bustRange: 5,
  bustTime: 2.4, // seconds pinned and slow before the bust lands
  shootRange: 20,
  shootDamage: 7, // per hit, at wanted 3+
};

export const WANTED = {
  steal: 1,
  hitPed: 2,
  shootPed: 2,
  hitCar: 1,
  hitPolice: 1,
  decayDelay: 9, // unseen seconds before a star fades
  sightRange: 46, // police "see" the player inside this, roughly
};

/** Mission rewards in dollars, by mission index. */
export const REWARDS = [500, 900, 1500];

export const PALETTE = {
  sky: 0x87b5d9,
  duskSky: 0x2c2a4a,
  fog: 0x9db8cc,
  ground: 0x2b2f36,
  road: 0x1d1f24,
  sidewalk: 0x424750,
  water: 0x0e2f42,
  neonPink: 0xff3d7e,
  neonCyan: 0x28e6ff,
  gold: 0xffd34d,
};

export const CAR_COLORS = [0xc23b4e, 0x3b6ec2, 0xd8d8dc, 0x2f333a, 0xd9a441, 0x3fae6a, 0x7a4fd0, 0xe8e8f0, 0x8c97a5, 0x24303c];
export const PED_COLORS = [0xd95f43, 0x4f83d9, 0x53b06a, 0xd9c84f, 0xb45fd9, 0x4fd0c0, 0xe8e2d4, 0x707a88];

/** localStorage keys for the save slot and the best-earnings record. */
export const SAVE_KEY = 'vice-harbor.save.v1';
export const BEST_KEY = 'vice-harbor.best.v1';
