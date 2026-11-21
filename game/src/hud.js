// The HUD is plain DOM over the canvas: money and wanted stars top-right, health and speed
// bottom-left, the objective banner top-centre, and a canvas minimap bottom-right that draws
// the whole harbour — avenues, blocks, water, traffic, police, and the gold objective.

import { CITY } from './config.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    money: $('money'),
    stars: $('stars'),
    clock: $('clock'),
    health: $('health-fill'),
    state: $('hud-state'),
    objTitle: $('objective-title'),
    objText: $('objective-text'),
    objDist: $('objective-dist'),
    objective: $('objective'),
    prompt: $('prompt'),
    banner: $('banner'),
    bannerMain: $('banner-main'),
    bannerSub: $('banner-sub'),
    damage: $('damage'),
    minimap: $('minimap'),
  };
  const map = els.minimap.getContext('2d');
  let bannerUntil = 0;
  let lastMoney = null;
  let lastStars = null;

  function banner(main, sub = '', seconds = 2.6) {
    els.bannerMain.textContent = main;
    els.bannerSub.textContent = sub;
    els.banner.style.opacity = '1';
    bannerUntil = performance.now() + seconds * 1000;
  }

  function drawMinimap(view, t) {
    const S = 184;
    const scale = S / (CITY.extent * 2 + 26);
    const toX = (x) => S / 2 + x * scale;
    const toY = (z) => S / 2 + z * scale;
    map.clearRect(0, 0, S, S);
    map.fillStyle = '#0c1220';
    map.fillRect(0, 0, S, S);
    // Water: east and south bands.
    map.fillStyle = '#0e2f42';
    map.fillRect(toX(CITY.extent), 0, S - toX(CITY.extent), S);
    map.fillRect(0, toY(CITY.extent), S, S - toY(CITY.extent));
    // Blocks.
    map.fillStyle = '#1b2434';
    for (const b of view.blocks) {
      map.fillRect(toX(b.x0), toY(b.z0), (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale);
    }
    // Avenues.
    map.strokeStyle = '#39465c';
    map.lineWidth = Math.max(1.5, CITY.roadWidth * scale);
    for (const c of CITY.lines) {
      map.beginPath();
      map.moveTo(toX(c), toY(-CITY.extent));
      map.lineTo(toX(c), toY(CITY.extent));
      map.stroke();
      map.beginPath();
      map.moveTo(toX(-CITY.extent), toY(c));
      map.lineTo(toX(CITY.extent), toY(c));
      map.stroke();
    }
    // Objective: a pulsing gold ring.
    if (view.target) {
      const pulse = 4.5 + Math.sin(t * 5) * 1.6;
      map.strokeStyle = '#ffd34d';
      map.lineWidth = 2;
      map.beginPath();
      map.arc(toX(view.target.x), toY(view.target.z), pulse, 0, Math.PI * 2);
      map.stroke();
    }
    // Traffic.
    map.fillStyle = '#cfd6de';
    for (const c of view.traffic) {
      map.fillRect(toX(c.x) - 1.3, toY(c.z) - 1.3, 2.6, 2.6);
    }
    // Police, flashing.
    if (Math.floor(t * 3) % 2 === 0) {
      map.fillStyle = '#5ea0ff';
      for (const c of view.police) {
        map.beginPath();
        map.arc(toX(c.x), toY(c.z), 2.6, 0, Math.PI * 2);
        map.fill();
      }
    }
    // The player: a white wedge pointing where they face.
    const px = toX(view.player.x);
    const py = toY(view.player.z);
    map.save();
    map.translate(px, py);
    map.rotate(Math.PI - view.player.heading);
    map.fillStyle = '#ffffff';
    map.beginPath();
    map.moveTo(0, -5.5);
    map.lineTo(3.6, 4.2);
    map.lineTo(-3.6, 4.2);
    map.closePath();
    map.fill();
    map.restore();
    // North marker.
    map.fillStyle = 'rgba(255,255,255,0.65)';
    map.font = '700 10px system-ui, sans-serif';
    map.fillText('N', S - 14, 13);
  }

  return {
    banner,
    showPrompt(html) {
      if (html) {
        els.prompt.innerHTML = html;
        els.prompt.style.display = 'block';
      } else {
        els.prompt.style.display = 'none';
      }
    },
    damageFlash() {
      els.damage.style.opacity = '1';
      window.setTimeout(() => {
        els.damage.style.opacity = '0';
      }, 70);
    },
    /** view: everything the minimap needs; state: the numbers. Called every frame. */
    update(state, view, t) {
      if (state.money !== lastMoney) {
        els.money.textContent = `$${state.money.toLocaleString('en-US')}`;
        lastMoney = state.money;
      }
      if (state.wanted !== lastStars) {
        let html = '';
        for (let i = 0; i < 5; i += 1) html += i < state.wanted ? '★' : '<span class="off">★</span>';
        els.stars.innerHTML = html;
        lastStars = state.wanted;
      }
      els.clock.textContent = state.dayLabel;
      els.health.style.width = `${Math.max(0, state.health)}%`;
      els.state.innerHTML = state.mode === 'car'
        ? `Driving — <span id="speed">${Math.round(state.speedKmh)} km/h</span>`
        : 'On foot';
      if (state.objective) {
        els.objective.style.display = 'block';
        els.objTitle.textContent = state.objective.title;
        els.objText.textContent = state.objective.text;
        els.objDist.textContent = state.objective.target ? `${Math.round(state.objective.dist)} m` : '';
      } else {
        els.objective.style.display = 'none';
      }
      if (bannerUntil && performance.now() > bannerUntil) {
        els.banner.style.opacity = '0';
        bannerUntil = 0;
      }
      drawMinimap(view, t);
    },
  };
}
