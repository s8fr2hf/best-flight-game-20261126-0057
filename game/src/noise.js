// Seeded value noise and the terrain heightmap for Skyline Courier.
// Everything here is deterministic: the same seed always grows the same
// valleys, ridge and lakes, so a screenshot can be staged exactly.

export function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    // Mulberry32: small, fast, and good enough for terrain and clouds.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashLattice(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634239) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// One octave of value noise over the x/z plane, cell size in metres.
export function valueNoise(x, z, cell, seed) {
  const gx = x / cell;
  const gz = z / cell;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hashLattice(ix, iz, seed);
  const b = hashLattice(ix + 1, iz, seed);
  const c = hashLattice(ix, iz + 1, seed);
  const d = hashLattice(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Runway strips that must stay flat: [centreX, centreZ, halfLength, halfWidth, heading].
export const RUNWAYS = [
  { x: 0, z: 0, halfLength: 380, halfWidth: 26, heading: 0, name: 'Home Field' },
  { x: 2600, z: 4300, halfLength: 340, halfWidth: 24, heading: 0.35, name: 'Ridge Strip' },
];

function flattenNearRunways(x, z, height) {
  for (const runway of RUNWAYS) {
    const dx = x - runway.x;
    const dz = z - runway.z;
    // Rotate the world offset into the strip's frame: along runs down the
    // strip, across runs over it. Heading 0 means the strip runs north.
    const along = dx * Math.sin(runway.heading) + dz * Math.cos(runway.heading);
    const across = dx * Math.cos(runway.heading) - dz * Math.sin(runway.heading);
    const edge = Math.max(
      Math.abs(along) / (runway.halfLength + 160),
      Math.abs(across) / (runway.halfWidth + 160),
    );
    if (edge < 1) {
      const blend = smooth(1 - edge);
      height = height * (1 - blend) + 4 * blend;
    }
    // A level approach corridor along the strip's axis, so the final
    // approach flies over a gentle valley instead of a rising hill.
    const beyond = Math.max(0, Math.abs(along) - runway.halfLength);
    if (Math.abs(across) < 180 && beyond < 900) {
      const corridor = smooth(1 - Math.abs(across) / 180) * smooth(1 - beyond / 900);
      height = height * (1 - corridor) + 4 * corridor;
    }
  }
  return height;
}

// Height of the ground in metres at world (x, z). Water sits at 0.
export function terrainHeight(x, z) {
  const rolling = valueNoise(x, z, 420, 11) * 2 - 1;
  const hills = valueNoise(x, z, 150, 23) * 2 - 1;
  const ridge = valueNoise(x, z, 900, 37) * 2 - 1;
  // A mountain spine runs diagonally across the far north-east of the map,
  // clear of the home valley so the first sorties fly over green ground.
  const spine = Math.exp(-Math.pow((x * 0.55 - z * 0.75 + 1400) / 420, 2));
  let height = 26 + rolling * 34 + hills * 14 + ridge * 22 + spine * 130;
  // Carve a lake basin south-west and a river valley through the middle.
  const lake = Math.exp(-(Math.pow(x + 1500, 2) + Math.pow(z + 900, 2)) / (2 * 620 * 620));
  height -= lake * 34;
  const river = Math.exp(-Math.pow((x + z * 0.35 - 600) / 260, 2));
  height -= river * 20;
  height = flattenNearRunways(x, z, height);
  return height;
}

export function isWater(x, z) {
  return terrainHeight(x, z) < 1.5;
}

// A few puffy cloud anchors, placed once per seed.
export function makeClouds(seed, count) {
  const random = makeRandom(seed);
  const clouds = [];
  for (let i = 0; i < count; i += 1) {
    clouds.push({
      x: (random() - 0.5) * 9000,
      z: (random() - 0.5) * 9000,
      y: 420 + random() * 260,
      scale: 120 + random() * 220,
      puffs: 3 + Math.floor(random() * 3),
      drift: 2 + random() * 3,
    });
  }
  return clouds;
}
