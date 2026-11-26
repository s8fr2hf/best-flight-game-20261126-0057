// The three sorties of Skyline Courier. Each one is a list of glowing rings
// to thread in order and a strip to land on afterwards. Rings sit over
// recognisable ground — the lake, the river valley, the ridge — so the pilot
// navigates by looking out of the window, not only at the compass.

export const MISSIONS = [
  {
    id: 'dawn-mail',
    name: 'Dawn Mail Run',
    tag: 'Learn the valley',
    blurb: 'Five rings over the lake and the river, then home to the strip. Easy fuel, easy sky.',
    fuel: 100,
    timeLimit: 0, // 0 = no clock
    wind: { x: 0, z: 0 },
    gust: 0,
    start: { x: 0, y: 8, z: -330, heading: 0 },
    landAt: { x: 0, z: 0, heading: 0, name: 'Home Field' },
    rings: [
      { x: 0, y: 120, z: 700, r: 20 },
      { x: -650, y: 195, z: 1300, r: 20 },
      { x: -1500, y: 130, z: 300, r: 20 },
      { x: -1150, y: 170, z: -750, r: 20 },
      { x: -250, y: 140, z: -1150, r: 20 },
    ],
  },
  {
    id: 'ridge-courier',
    name: 'Ridge Courier',
    tag: 'Over the spine',
    blurb: 'Seven rings across the mountain spine to the far strip. Watch the fuel gauge — the ridge eats it.',
    fuel: 100,
    timeLimit: 0,
    wind: { x: 3, z: -2 },
    gust: 0.06,
    start: { x: 0, y: 8, z: -330, heading: 0 },
    landAt: { x: 2600, z: 4300, heading: 0.35, name: 'Ridge Strip' },
    rings: [
      { x: 500, y: 160, z: 900, r: 18 },
      { x: 1150, y: 210, z: 1700, r: 18 },
      { x: 1500, y: 280, z: 2600, r: 18 },
      { x: 1750, y: 320, z: 3400, r: 18 },
      { x: 2200, y: 260, z: 3900, r: 18 },
      { x: 2600, y: 180, z: 4300, r: 18 },
      { x: 2900, y: 160, z: 4700, r: 18 },
    ],
  },
  {
    id: 'storm-deadline',
    name: 'Storm Deadline',
    tag: 'Beat the clock',
    blurb: 'Six rings, four minutes, and a crosswind that shoves you off line. Throttle discipline pays.',
    fuel: 100,
    timeLimit: 240,
    wind: { x: -7, z: 4 },
    gust: 0.16,
    start: { x: 0, y: 8, z: -330, heading: 0 },
    landAt: { x: 0, z: 0, heading: 0, name: 'Home Field' },
    rings: [
      { x: 800, y: 150, z: 600, r: 18 },
      { x: 1400, y: 190, z: -200, r: 18 },
      { x: 900, y: 220, z: -1200, r: 18 },
      { x: -200, y: 180, z: -1600, r: 18 },
      { x: -1100, y: 150, z: -900, r: 18 },
      { x: -700, y: 130, z: 200, r: 18 },
    ],
  },
];

export function makeMissionState(mission) {
  return {
    mission,
    ringIndex: 0,
    ringsHit: 0,
    score: 0,
    elapsed: 0,
    timeLeft: mission.timeLimit,
    message: '',
    messageUntil: 0,
    finished: false,
    result: null, // 'delivered' | 'crashed' | 'out-of-time'
  };
}

export function distance3(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Check the next ring; returns 'ring' when the plane threads it.
export function checkRing(state, plane) {
  if (state.ringIndex >= state.mission.rings.length) return '';
  const ring = state.mission.rings[state.ringIndex];
  if (distance3(plane.x, plane.y, plane.z, ring.x, ring.y, ring.z) < ring.r) {
    state.ringIndex += 1;
    state.ringsHit += 1;
    state.score += 100;
    if (state.ringIndex >= state.mission.rings.length) {
      state.message = `All rings threaded — bring her home to ${state.mission.landAt.name}!`;
    } else {
      state.message = `Ring ${state.ringsHit} of ${state.mission.rings.length} — nice flying!`;
    }
    state.messageUntil = state.elapsed + 3;
    return 'ring';
  }
  return '';
}

// Score a finished sortie: rings, speed, fuel left, and how gently it landed.
export function scoreLanding(state, plane) {
  const timeBonus = state.mission.timeLimit > 0
    ? Math.max(0, Math.round(state.timeLeft)) * 2
    : Math.max(0, 300 - Math.round(state.elapsed)) * 1;
  const fuelBonus = Math.round(plane.fuel) * 2;
  const damagePenalty = plane.damage * 3;
  const total = state.score + Math.max(0, timeBonus) + fuelBonus - damagePenalty + 250;
  return {
    rings: state.score,
    timeBonus: Math.max(0, timeBonus),
    fuelBonus,
    damagePenalty,
    total: Math.max(0, total),
  };
}
