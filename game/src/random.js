// A small seeded random number generator (mulberry32). The city, the traffic and the
// screenshot scenes all draw from one of these, so the same seed always builds the same
// Vice Harbor — which is what makes the staged screenshots repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number in [min, max] drawn from rng. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** A float in [min, max) drawn from rng. */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** One element of list, drawn from rng. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}
