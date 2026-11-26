// Skyline Courier — a bush-plane courier game. Fly the amber rings, mind the
// fuel, and put her down gently on the strip. Keyboard and mouse, no network,
// no build step: index.html and these modules are the whole game.

import { makeRandom, makeClouds, terrainHeight } from './noise.js';
import {
  makePlane, stepFlight, stepRollout,
} from './flight.js';
import { MISSIONS, makeMissionState, checkRing, scoreLanding } from './missions.js';
import { makeCamera, updateCamera, renderScene } from './render.js';
import {
  drawCompass, drawTapes, drawAttitude, drawEngine, drawMissionPanel,
  drawWarnings, drawMessage,
} from './hud.js';
import { makeInput, attachInput, pollInput } from './input.js';
import {
  makeAudio, startAudio, updateAudio, playRingChime, playLandChime,
  playCrashThud, playClick,
} from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');

const game = {
  mode: 'menu', // menu | flying | paused | over
  missions: MISSIONS,
  selectedMission: 0,
  plane: makePlane(),
  missionState: null,
  camera: makeCamera(),
  clouds: makeClouds(20261126, 26),
  time: 0,
  best: loadBest(),
  input: makeInput(),
  audio: makeAudio(),
  shot: null,
  seedRandom: makeRandom(20261126),
};

function loadBest() {
  try {
    return JSON.parse(window.localStorage.getItem('skyline-courier-best') || '{}');
  } catch {
    return {};
  }
}

function saveBest() {
  try {
    window.localStorage.setItem('skyline-courier-best', JSON.stringify(game.best));
  } catch {
    // Private mode or no storage: best scores simply do not persist.
  }
}

function startMission(index) {
  const mission = MISSIONS[index];
  game.selectedMission = index;
  game.plane = makePlane();
  const start = mission.start;
  game.plane.x = start.x;
  game.plane.y = start.y;
  game.plane.z = start.z;
  game.plane.heading = start.heading;
  game.missionState = makeMissionState(mission);
  game.missionState.message = 'Throttle up with Shift — rotate past 65 kt!';
  game.missionState.messageUntil = 6;
  game.camera.x = start.x;
  game.camera.y = start.y + 7;
  game.camera.z = start.z - 20;
  game.camera.heading = start.heading;
  game.mode = 'flying';
  startAudio(game.audio);
  playClick(game.audio);
  announce(`${mission.name} started. Fly the amber rings, then land.`);
}

function announce(text) {
  if (statusLine) statusLine.textContent = text;
}

function endMission(result) {
  const state = game.missionState;
  state.finished = true;
  state.result = result;
  if (result === 'delivered') {
    state.breakdown = scoreLanding(state, game.plane);
    const id = state.mission.id;
    if (!game.best[id] || state.breakdown.total > game.best[id]) {
      game.best[id] = state.breakdown.total;
      saveBest();
    }
    playLandChime(game.audio);
    announce(`Delivered. Score ${state.breakdown.total}.`);
  } else if (result === 'crashed') {
    playCrashThud(game.audio);
    announce(`Crashed. ${game.plane.crashReason}`);
  } else {
    announce('Out of time — the mail missed its slot.');
  }
  game.mode = 'over';
}

function onKey(code) {
  if (code === 'KeyM') {
    game.audio.muted = !game.audio.muted;
    return;
  }
  if (game.mode === 'menu') {
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
      startMission(Number(code.slice(-1)) - 1);
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      game.selectedMission = (game.selectedMission + MISSIONS.length - 1) % MISSIONS.length;
      playClick(game.audio);
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      game.selectedMission = (game.selectedMission + 1) % MISSIONS.length;
      playClick(game.audio);
    } else if (code === 'Enter' || code === 'Space') {
      startMission(game.selectedMission);
    }
    return;
  }
  if (game.mode === 'flying') {
    if (code === 'KeyP' || code === 'Escape') game.mode = 'paused';
    return;
  }
  if (game.mode === 'paused') {
    if (code === 'KeyP' || code === 'Escape' || code === 'Enter') game.mode = 'flying';
    if (code === 'KeyR') startMission(game.selectedMission);
    return;
  }
  if (game.mode === 'over') {
    if (code === 'KeyR' || code === 'Enter' || code === 'Space') startMission(game.selectedMission);
    if (code === 'Escape') game.mode = 'menu';
  }
}

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  game.width = window.innerWidth;
  game.height = window.innerHeight;
}

function update(dt) {
  game.time += dt;
  if (game.mode !== 'flying') return;
  const plane = game.plane;
  const state = game.missionState;
  const mission = state.mission;
  pollInput(game.input, game.width, game.height);

  // Wind with gusts: a steady push plus a slow shove that the pilot trims out.
  const gust = mission.gust * Math.sin(game.time * 0.6) * 14;
  const wind = {
    x: mission.wind.x + gust,
    z: mission.wind.z + gust * 0.6,
  };
  const event = stepFlight(plane, game.input, wind, dt, terrainHeight);
  if (event === 'rotate') {
    state.message = 'Airborne! Climb out and find the first ring.';
    state.messageUntil = state.elapsed + 3;
  } else if (event === 'touchdown' || event === 'hard-landing') {
    state.message = event === 'hard-landing'
      ? 'Down — but hard. The airframe felt that one.'
      : 'Touchdown! Roll her out.';
    state.messageUntil = state.elapsed + 3;
  } else if (event === 'crash') {
    endMission('crashed');
    return;
  }
  // The rollout only brakes a plane that has actually flown and come back
  // down: during the takeoff roll the throttle and the acceleration belong
  // to the pilot, not to the brakes.
  if (plane.onGround && plane.airTime > 1 && !plane.crashed) stepRollout(plane, dt, terrainHeight);
  if (plane.landed && !state.finished) {
    if (state.ringIndex < mission.rings.length) {
      state.message = 'Landed — but the rings are still out there. Press R to fly again.';
      state.messageUntil = state.elapsed + 4;
      state.finished = true;
      state.result = 'landed-early';
      game.mode = 'over';
      return;
    }
    endMission('delivered');
    return;
  }
  if (checkRing(state, plane) === 'ring') playRingChime(game.audio);
  state.elapsed += dt;
  if (mission.timeLimit > 0) {
    state.timeLeft = mission.timeLimit - state.elapsed;
    if (state.timeLeft <= 0 && !state.finished) {
      endMission('out-of-time');
      return;
    }
  }
  updateAudio(game.audio, plane);
  updateCamera(game.camera, plane, dt);
}

function drawMenu() {
  const { width, height } = game;
  const ctx2 = ctx;
  // A quiet valley behind the menu: the camera drifts over Home Field.
  const driftPlane = {
    x: Math.sin(game.time * 0.02) * 400,
    y: 260,
    z: Math.cos(game.time * 0.02) * 400 - 600,
    heading: game.time * 0.02,
    pitch: -0.08,
    roll: 0,
  };
  updateCamera(game.camera, driftPlane, 0.016);
  renderScene(ctx2, width, height, {
    camera: game.camera,
    plane: driftPlane,
    missionState: null,
    clouds: game.clouds,
    time: game.time,
    showPlane: false,
  });
  ctx2.fillStyle = 'rgba(6,12,20,0.45)';
  ctx2.fillRect(0, 0, width, height);
  ctx2.textAlign = 'center';
  ctx2.fillStyle = '#ffb020';
  ctx2.font = '700 15px system-ui, sans-serif';
  ctx2.fillText('S K Y L I N E   C O U R I E R', width / 2, height * 0.16);
  ctx2.fillStyle = '#ffffff';
  ctx2.font = '700 64px system-ui, sans-serif';
  ctx2.fillText('Skyline Courier', width / 2, height * 0.16 + 66);
  ctx2.fillStyle = '#cfe6ff';
  ctx2.font = '400 18px system-ui, sans-serif';
  ctx2.fillText('Fly the rings. Mind the fuel. Put her down gentle.', width / 2, height * 0.16 + 98);

  const cardW = Math.min(560, width * 0.86);
  const cardX = (width - cardW) / 2;
  let cardY = height * 0.34;
  MISSIONS.forEach((mission, i) => {
    const h = 74;
    const selected = i === game.selectedMission;
    ctx2.fillStyle = selected ? 'rgba(255,176,32,0.92)' : 'rgba(8,14,22,0.72)';
    ctx2.strokeStyle = selected ? '#ffd98a' : 'rgba(140,200,255,0.4)';
    ctx2.lineWidth = selected ? 2 : 1;
    ctx2.beginPath();
    ctx2.roundRect(cardX, cardY, cardW, h, 10);
    ctx2.fill();
    ctx2.stroke();
    const textColour = selected ? '#1a1206' : '#ffffff';
    const subColour = selected ? '#5a4312' : '#8fb8dd';
    ctx2.textAlign = 'left';
    ctx2.fillStyle = textColour;
    ctx2.font = '700 19px system-ui, sans-serif';
    ctx2.fillText(`${i + 1}. ${mission.name} — ${mission.tag}`, cardX + 18, cardY + 28);
    ctx2.fillStyle = subColour;
    ctx2.font = '400 13px system-ui, sans-serif';
    ctx2.fillText(mission.blurb, cardX + 18, cardY + 50);
    const best = game.best[mission.id];
    ctx2.textAlign = 'right';
    ctx2.fillStyle = subColour;
    ctx2.font = '600 13px system-ui, sans-serif';
    ctx2.fillText(best ? `BEST ${best}` : 'NOT FLOWN', cardX + cardW - 18, cardY + 28);
    cardY += h + 12;
  });

  ctx2.textAlign = 'center';
  ctx2.fillStyle = '#e8f2fb';
  ctx2.font = '400 14px system-ui, sans-serif';
  const controlsY = cardY + 22;
  ctx2.fillText('↑ ↓ pitch   ← → bank   Shift / Ctrl throttle   Mouse: hold left button to steer', width / 2, controlsY);
  ctx2.fillText('P pause   R restart   M mute   Enter fly', width / 2, controlsY + 22);
  ctx2.fillStyle = '#8fb8dd';
  ctx2.font = '400 12px system-ui, sans-serif';
  ctx2.fillText('An original game — no real aircraft, places or people. Best played full-screen.', width / 2, controlsY + 48);
}

function drawPaused() {
  drawFlying();
  ctx.fillStyle = 'rgba(6,12,20,0.55)';
  ctx.fillRect(0, 0, game.width, game.height);
  drawMessage(ctx, game.width, game.height, 'PAUSED', 'P resume · R restart the sortie');
}

function drawFlying() {
  const { width, height } = game;
  renderScene(ctx, width, height, {
    camera: game.camera,
    plane: game.plane,
    missionState: game.missionState,
    clouds: game.clouds,
    time: game.time,
  });
  drawCompass(ctx, width, game.plane);
  drawTapes(ctx, width, height, game.plane);
  drawAttitude(ctx, width, height, game.plane);
  drawEngine(ctx, width, height, game.plane);
  drawMissionPanel(ctx, width, height, game.missionState, game.plane);
  drawWarnings(ctx, width, height, game.plane, game.missionState, game.time);
  const state = game.missionState;
  if (state.message && game.time < state.messageUntil) {
    ctx.fillStyle = 'rgba(8,14,22,0.6)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(state.message).width + 36;
    ctx.beginPath();
    ctx.roundRect((width - tw) / 2, height - 178, tw, 30, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(state.message, width / 2, height - 158);
  }
}

function drawOver() {
  drawFlying();
  const { width, height } = game;
  ctx.fillStyle = 'rgba(6,12,20,0.5)';
  ctx.fillRect(0, 0, width, height);
  const state = game.missionState;
  const plane = game.plane;
  let title = '';
  let lines = [];
  if (state.result === 'delivered') {
    title = 'DELIVERED — WELCOME HOME';
    const b = state.breakdown;
    lines = [
      `Rings ${b.rings}  ·  Time bonus ${b.timeBonus}  ·  Fuel bonus ${b.fuelBonus}`,
      `Damage penalty −${b.damagePenalty}`,
      `TOTAL SCORE  ${b.total}`,
      `Best on this sortie: ${game.best[state.mission.id]}`,
    ];
  } else if (state.result === 'crashed') {
    title = 'CRASHED';
    lines = [plane.crashReason, 'The Courier is tough, but not that tough.', 'Press R to fly again.'];
  } else if (state.result === 'out-of-time') {
    title = 'OUT OF TIME';
    lines = ['The mail missed its slot.', 'Fly faster — or gentler on the throttle.', 'Press R to fly again.'];
  } else {
    title = 'ON THE GROUND';
    lines = [state.message, 'Press R to fly again, Esc for the menu.'];
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb020';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(state.mission.name.toUpperCase(), width / 2, height * 0.30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText(title, width / 2, height * 0.30 + 56);
  ctx.fillStyle = '#cfe6ff';
  ctx.font = '400 17px system-ui, sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, height * 0.30 + 96 + i * 28);
  });
  ctx.fillStyle = '#8fb8dd';
  ctx.font = '400 13px system-ui, sans-serif';
  ctx.fillText('R fly again · Esc menu', width / 2, height * 0.30 + 96 + lines.length * 28 + 18);
}

function draw() {
  if (game.mode === 'menu') drawMenu();
  else if (game.mode === 'paused') drawPaused();
  else if (game.mode === 'over') drawOver();
  else drawFlying();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function boot() {
  resize();
  window.addEventListener('resize', resize);
  attachInput(game.input, canvas, onKey);
  canvas.addEventListener('click', () => startAudio(game.audio));
  const query = new URLSearchParams(window.location.search);
  const shot = query.get('shot');
  if (shot) {
    game.shot = shot;
    stageShot(game, shot);
  }
  // Click a mission card on the menu.
  canvas.addEventListener('click', (event) => {
    if (game.mode !== 'menu') return;
    const cardW = Math.min(560, game.width * 0.86);
    const cardX = (game.width - cardW) / 2;
    let cardY = game.height * 0.34;
    for (let i = 0; i < MISSIONS.length; i += 1) {
      if (event.clientY >= cardY && event.clientY <= cardY + 74
        && event.clientX >= cardX && event.clientX <= cardX + cardW) {
        startMission(i);
        return;
      }
      cardY += 86;
    }
  });
  requestAnimationFrame(frame);
}

// Exposed for play-testing and for the screenshot stager, nothing else.
window.__courier = {
  game,
  startMission,
  terrainHeight,
  version: 'skyline-courier-1',
};

boot();
