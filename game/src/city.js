// The city of Vice Harbor, built procedurally from the avenue grid: tower blocks with lit
// windows, a casino plaza, a park, docks and a boardwalk over the bay. Everything visual is
// boxes and canvas textures — no model files — and every solid thing registers an AABB in
// `colliders` so the player, the traffic and the police all bump into the same city.
// Also returned: the block rectangles (the minimap draws them) and an update() for the
// water shimmer, traffic lights and neon flicker.

import { CITY, PALETTE } from './config.js';
import { randInt, randRange, pick } from './random.js';

const unitBox = () => new THREE.BoxGeometry(1, 1, 1);
const BOX = unitBox();

function box(parent, mat, x, y, z, sx, sy, sz, ry = 0) {
  const mesh = new THREE.Mesh(BOX, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A facade texture pair (day map + emissive windows) drawn on a canvas. */
function facadeTextures(rng, base, litRatio) {
  const w = 128;
  const h = 256;
  const map = document.createElement('canvas');
  map.width = w;
  map.height = h;
  const glow = document.createElement('canvas');
  glow.width = w;
  glow.height = h;
  const m = map.getContext('2d');
  const g = glow.getContext('2d');
  m.fillStyle = base;
  m.fillRect(0, 0, w, h);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const cols = 8;
  const rows = 18;
  const cw = w / cols;
  const ch = h / rows;
  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const lit = rng() < litRatio;
      const warm = rng() < 0.7;
      m.fillStyle = lit ? (warm ? '#d9b878' : '#a8c8e0') : '#141922';
      m.fillRect(x * cw + 2, y * ch + 3, cw - 4, ch - 6);
      if (lit) {
        g.fillStyle = warm ? '#ffca7a' : '#9fd4ff';
        g.fillRect(x * cw + 2, y * ch + 3, cw - 4, ch - 6);
      }
    }
  }
  const mapTex = new THREE.CanvasTexture(map);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  const glowTex = new THREE.CanvasTexture(glow);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return { mapTex, glowTex };
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1d1f24';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(2, 0, 3, 128);
  g.fillRect(123, 0, 3, 128);
  g.fillStyle = '#d8b93a';
  g.fillRect(62, 6, 4, 52); // one dash per tile; the repeat makes the dashed centre line
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0e2f42';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i += 1) {
    g.fillStyle = `rgba(120,200,235,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 8, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

function signTexture(text, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.font = '900 64px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = fg;
  g.shadowBlur = 26;
  g.fillStyle = fg;
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const blocks = [];
  const facadeMats = [];
  const lampHeads = [];
  const trafficLights = [];
  const waterMats = [];

  const addCollider = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });

  // --- ground, roads, sidewalks -------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), new THREE.MeshLambertMaterial({ color: PALETTE.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.extent * 2 + 46, CITY.extent * 2 + 46),
    new THREE.MeshLambertMaterial({ color: 0x33373f }),
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = 0.0;
  slab.receiveShadow = true;
  group.add(slab);

  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const span = CITY.extent * 2 + CITY.roadWidth * 2;
  for (const c of CITY.lines) {
    for (const axis of ['x', 'z']) {
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, span / 9);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, span), mat);
      road.rotation.x = -Math.PI / 2;
      if (axis === 'x') {
        road.rotation.z = Math.PI / 2;
        road.position.set(0, 0.02, c);
      } else {
        road.position.set(c, 0.02, 0);
      }
      road.receiveShadow = true;
      group.add(road);
      for (const side of [-1, 1]) {
        const off = side * (CITY.roadWidth / 2 + 1.7);
        const walk = box(group, walkMat, axis === 'x' ? 0 : c + off, 0.05, axis === 'x' ? c + off : 0,
          axis === 'x' ? span : 3.4, 0.1, axis === 'x' ? 3.4 : span);
        walk.castShadow = false;
      }
    }
  }

  // --- the bay: water east and south, docks, boardwalk ---------------------
  const waterTex = waterTexture();
  const waterMat = new THREE.MeshPhongMaterial({ map: waterTex, color: 0xbfd9e8, shininess: 140, specular: 0x99ccee });
  waterMats.push(waterMat);
  const waterEast = new THREE.Mesh(new THREE.PlaneGeometry(420, 1100), waterMat);
  waterEast.rotation.x = -Math.PI / 2;
  waterEast.position.set(CITY.extent + 218, -0.35, 0);
  group.add(waterEast);
  const waterSouth = new THREE.Mesh(new THREE.PlaneGeometry(1100, 420), waterMat);
  waterSouth.rotation.x = -Math.PI / 2;
  waterSouth.position.set(0, -0.35, CITY.extent + 218);
  group.add(waterSouth);

  const woodMat = new THREE.MeshLambertMaterial({ color: 0x6e5136 });
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6b42 });
  const crateMat2 = new THREE.MeshLambertMaterial({ color: 0x51606e });
  // Boardwalk along the south shore.
  box(group, woodMat, 0, 0.12, CITY.extent - 4, CITY.extent * 2, 0.24, 9).castShadow = false;
  // Piers and crates at the Docks (east).
  for (const pz of [12, 40, 68]) {
    box(group, woodMat, CITY.extent + 12, 0.1, pz, 26, 0.2, 7).castShadow = false;
    for (let i = 0; i < 3; i += 1) {
      const cx = CITY.extent - 6 - i * 5;
      const cz = pz + randRange(rng, -2, 2);
      const s = randRange(rng, 1.6, 2.6);
      box(group, rng() < 0.5 ? crateMat : crateMat2, cx, s / 2, cz, s, s, s, rng() * 0.4);
      addCollider(cx - s / 2, cz - s / 2, cx + s / 2, cz + s / 2);
    }
  }
  // A dock crane over the middle pier.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xc2703d });
  box(group, craneMat, CITY.extent - 2, 7, 33, 0.8, 14, 0.8);
  box(group, craneMat, CITY.extent - 2, 7, 47, 0.8, 14, 0.8);
  box(group, craneMat, CITY.extent + 4, 13.6, 40, 14, 0.8, 0.8);
  addCollider(CITY.extent - 2.4, 32.6, CITY.extent + 1.6, 33.4);
  addCollider(CITY.extent - 2.4, 46.6, CITY.extent + 1.6, 47.4);

  // --- buildings ------------------------------------------------------------
  const facadeDefs = [
    ['#4a4f5c', 0.5], ['#5c4a52', 0.45], ['#44586b', 0.55], ['#5f5a48', 0.4], ['#3f4653', 0.6], ['#66505f', 0.42],
  ];
  for (const [base, lit] of facadeDefs) {
    const { mapTex, glowTex } = facadeTextures(rng, base, lit);
    const mat = new THREE.MeshLambertMaterial({ map: mapTex, emissive: 0xffffff, emissiveMap: glowTex, emissiveIntensity: 0.32 });
    facadeMats.push(mat);
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const centers = [];
  for (let i = 0; i < CITY.lines.length - 1; i += 1) centers.push((CITY.lines[i] + CITY.lines[i + 1]) / 2);

  const PLAZA = { cx: 52, cz: -52 };
  const PARK = { cx: -52, cz: 104 };

  for (const cx of centers) {
    for (const cz of centers) {
      const half = (CITY.lines[1] - CITY.lines[0] - CITY.roadWidth) / 2 - CITY.blockInset; // ~15
      const x0 = cx - half;
      const x1 = cx + half;
      const z0 = cz - half;
      const z1 = cz + half;
      const isPlaza = cx === PLAZA.cx && cz === PLAZA.cz;
      const isPark = cx === PARK.cx && cz === PARK.cz;
      blocks.push({ x0, z0, x1, z1, kind: isPlaza ? 'plaza' : isPark ? 'park' : 'blocks' });
      if (isPark) {
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), new THREE.MeshLambertMaterial({ color: 0x39543a }));
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(cx, 0.04, cz);
        grass.receiveShadow = true;
        group.add(grass);
        continue;
      }
      if (isPlaza) {
        const pave = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), new THREE.MeshLambertMaterial({ color: 0x4c4550 }));
        pave.rotation.x = -Math.PI / 2;
        pave.position.set(cx, 0.04, cz);
        pave.receiveShadow = true;
        group.add(pave);
        // The casino itself along the plaza's north edge, wearing its neon.
        const cw = 26;
        const ch = 13;
        const cd = 8;
        const casino = box(group, facadeMats[1], cx, ch / 2, cz - half + cd / 2 + 1, cw, ch, cd);
        casino.castShadow = true;
        addCollider(cx - cw / 2, cz - half + 1, cx + cw / 2, cz - half + 1 + cd);
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(20, 5),
          new THREE.MeshBasicMaterial({ map: signTexture('CASINO SOL', '#ffd34d', '#1a0b16') }),
        );
        sign.position.set(cx, ch - 2.4, cz - half + 1 + cd + 0.06);
        group.add(sign);
        const trim = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: PALETTE.neonPink }));
        trim.position.set(cx, 1.1, cz - half + 1 + cd + 0.1);
        trim.scale.set(cw, 0.35, 0.1);
        group.add(trim);
        continue;
      }
      // Four tower plots per block, split by a cross of alleys.
      const plotHalf = half / 2 - 1.6;
      for (const px of [cx - half / 2, cx + half / 2]) {
        for (const pz of [cz - half / 2, cz + half / 2]) {
          if (rng() < 0.14) {
            // A parking pocket: crates and a dumpster instead of a tower.
            for (let i = 0; i < 3; i += 1) {
              const sx = px + randRange(rng, -5, 5);
              const sz = pz + randRange(rng, -5, 5);
              const s = randRange(rng, 1.4, 2.4);
              box(group, rng() < 0.5 ? crateMat : crateMat2, sx, s / 2, sz, s, s, s, rng() * 0.5);
              addCollider(sx - s / 2, sz - s / 2, sx + s / 2, sz + s / 2);
            }
            continue;
          }
          const distCenter = Math.hypot(cx, cz);
          const tall = distCenter < 80 ? randRange(rng, 20, 46) : randRange(rng, 9, 26);
          const w = plotHalf * 2 - randRange(rng, 0.5, 2.5);
          const d = plotHalf * 2 - randRange(rng, 0.5, 2.5);
          const mat = pick(rng, facadeMats);
          const tower = box(group, mat, px, tall / 2, pz, w, tall, d);
          tower.castShadow = true;
          const roof = box(group, roofMat, px, tall + 0.3, pz, w * 0.92, 0.6, d * 0.92);
          roof.castShadow = false;
          addCollider(px - w / 2, pz - d / 2, px + w / 2, pz + d / 2);
          // Rooftop clutter on some towers.
          if (rng() < 0.5) box(group, crateMat2, px + randRange(rng, -3, 3), tall + 1.1, pz + randRange(rng, -3, 3), 2.2, 1, 1.6).castShadow = false;
        }
      }
    }
  }

  // A neon gantry sign straddling the avenue at x=-26, the harbour's welcome mat.
  const gantryMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  box(group, gantryMat, -34.6, 6, -60, 0.7, 12, 0.7).castShadow = false;
  box(group, gantryMat, -17.4, 6, -60, 0.7, 12, 0.7).castShadow = false;
  box(group, gantryMat, -26, 11.8, -60, 18, 0.7, 0.7).castShadow = false;
  const gantrySign = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 4),
    new THREE.MeshBasicMaterial({ map: signTexture('VICE HARBOR', '#28e6ff', '#0a0f1c') }),
  );
  gantrySign.position.set(-26, 9.2, -59.6);
  group.add(gantrySign);
  const gantrySignBack = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 4),
    new THREE.MeshBasicMaterial({ map: signTexture('VICE HARBOR', '#ff3d7e', '#0a0f1c') }),
  );
  gantrySignBack.position.set(-26, 9.2, -60.4);
  gantrySignBack.rotation.y = Math.PI;
  group.add(gantrySignBack);

  // --- street furniture -------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
  lampHeads.push(lampHeadMat);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4e33 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3d7040 });
  const leafGeo = new THREE.IcosahedronGeometry(2.4, 0);
  function tree(x, z, s = 1) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 3.4 * s, 6), trunkMat);
    trunk.position.set(x, 1.7 * s, z);
    trunk.rotation.z = randRange(rng, -0.06, 0.06);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(leafGeo, leafMat);
    crown.position.set(x, 4.1 * s, z);
    crown.scale.set(s, s * 0.82, s);
    crown.castShadow = true;
    group.add(crown);
    addCollider(x - 0.35, z - 0.35, x + 0.35, z + 0.35);
  }
  // Palms along the boardwalk and in the park.
  for (let x = -140; x <= 140; x += 20) tree(x + randRange(rng, -3, 3), CITY.extent - 8.5, randRange(rng, 0.9, 1.25));
  for (let i = 0; i < 9; i += 1) tree(PARK.cx + randRange(rng, -12, 12), PARK.cz + randRange(rng, -12, 12), randRange(rng, 0.9, 1.3));
  // Lamps at intersection corners.
  for (const lx of CITY.lines) {
    for (const lz of CITY.lines) {
      if ((Math.round(lx) + Math.round(lz)) % 3 !== 0) continue;
      const x = lx + CITY.roadWidth / 2 + 1.2;
      const z = lz + CITY.roadWidth / 2 + 1.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6), poleMat);
      pole.position.set(x, 2.8, z);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), lampHeadMat);
      head.position.set(x, 5.7, z);
      group.add(head);
    }
  }
  // Traffic lights at the four central intersections.
  const tlMats = {
    red: new THREE.MeshBasicMaterial({ color: 0x441111 }),
    yellow: new THREE.MeshBasicMaterial({ color: 0x444411 }),
    green: new THREE.MeshBasicMaterial({ color: 0x114411 }),
  };
  for (const lx of [-26, 26]) {
    for (const lz of [-26, 26]) {
      const x = lx + CITY.roadWidth / 2 + 0.8;
      const z = lz - CITY.roadWidth / 2 - 0.8;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 6), poleMat);
      pole.position.set(x, 2.3, z);
      group.add(pole);
      const housing = box(group, poleMat, x, 4.9, z, 0.5, 1.3, 0.4);
      housing.castShadow = false;
      const dots = {};
      ['red', 'yellow', 'green'].forEach((name, i) => {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), tlMats[name].clone());
        dot.position.set(x, 5.32 - i * 0.42, z - 0.24);
        group.add(dot);
        dots[name] = dot.material;
      });
      trafficLights.push(dots);
    }
  }

  // Distant skyline silhouettes to the north and west, beyond the playable edge.
  const farMat = new THREE.MeshLambertMaterial({ color: 0x39424f });
  for (let i = 0; i < 26; i += 1) {
    const angle = Math.PI * (0.55 + i / 26 * 0.9); // sweep the north-west arc
    const r = randRange(rng, 250, 330);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r - 40;
    const h = randRange(rng, 25, 80);
    const far = box(group, farMat, x, h / 2, z, randRange(rng, 18, 34), h, randRange(rng, 18, 34));
    far.castShadow = false;
    far.receiveShadow = false;
  }

  let tlTimer = 0;
  function update(dt, t, dusk) {
    waterTex.offset.x = (t * 0.008) % 1;
    waterTex.offset.y = (t * 0.005) % 1;
    for (const mat of facadeMats) mat.emissiveIntensity = 0.3 + dusk * 0.8;
    lampHeadMat.color.setScalar(0.75 + dusk * 0.25).offsetHSL(0, 0, 0); // stays warm; brightness via dusk handled by renderer exposure
    tlTimer += dt;
    const phase = Math.floor(tlTimer / 4) % 2;
    for (const dots of trafficLights) {
      dots.red.color.setHex(phase === 0 ? 0xff2222 : 0x441111);
      dots.green.color.setHex(phase === 0 ? 0x114411 : 0x22ff44);
      dots.yellow.color.setHex(0x444411);
    }
  }

  return { colliders, blocks, update, plaza: PLAZA, park: PARK };
}

/** Push a circle (x, z, r) out of every AABB collider; returns the corrected position. */
export function resolveCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const nz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the nearest face.
      const left = pos.x - c.x0;
      const right = c.x1 - pos.x;
      const top = pos.z - c.z0;
      const bottom = c.z1 - pos.z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) pos.x = c.x0 - radius;
      else if (min === right) pos.x = c.x1 + radius;
      else if (min === top) pos.z = c.z0 - radius;
      else pos.z = c.z1 + radius;
    }
  }
  return pos;
}
