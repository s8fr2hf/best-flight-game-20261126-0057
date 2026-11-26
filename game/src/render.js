// The renderer: a chase camera over a projected heightmap. No library, no
// images — the sky, the terrain, the runway, the rings and the aircraft are
// all drawn from numbers every frame, so the game is one canvas and nothing
// else to load.

import { terrainHeight, isWater, RUNWAYS } from './noise.js';
import { forwardVector } from './flight.js';

const VIEW_FOV = 1.22; // radians, about 70 degrees
const GRID_CELLS = 34; // terrain cells across, centred on the camera
const CELL = 90; // metres per terrain cell

export function makeCamera() {
  return { x: 0, y: 20, z: -360, heading: 0, pitch: 0, roll: 0, fov: VIEW_FOV };
}

// Ease the chase camera behind the plane: it never snaps, never fights.
export function updateCamera(camera, plane, dt) {
  const fwd = forwardVector(plane);
  const tx = plane.x - fwd.x * 17;
  const ty = plane.y - fwd.y * 17 + 5.5;
  const tz = plane.z - fwd.z * 17;
  const k = Math.min(1, dt * 5);
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;
  camera.z += (tz - camera.z) * k;
  camera.heading = plane.heading;
  camera.pitch = plane.pitch * 0.55;
  camera.roll = plane.roll * 0.35;
}

// Project a world point into screen space. Returns null behind the camera.
export function project(camera, width, height, x, y, z) {
  const dx = x - camera.x;
  const dy = y - camera.y;
  const dz = z - camera.z;
  const ch = Math.cos(camera.heading);
  const sh = Math.sin(camera.heading);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  // Rotate into camera space: forward, right, up.
  const fz = dx * sh * cp + dy * sp + dz * ch * cp;
  if (fz < 2) return null;
  const fx = dx * ch - dz * sh;
  const fy = -dx * sh * sp + dy * cp - dz * ch * sp;
  const cr = Math.cos(camera.roll);
  const sr = Math.sin(camera.roll);
  const rx = fx * cr - fy * sr;
  const ry = fx * sr + fy * cr;
  const focal = (height / 2) / Math.tan(camera.fov / 2);
  return {
    x: width / 2 + (rx * focal) / fz,
    y: height / 2 - (ry * focal) / fz,
    depth: fz,
    scale: focal / fz,
  };
}

function terrainColour(height, slope, variation, haze) {
  let r;
  let g;
  let b;
  if (height < 1.5) {
    r = 46; g = 111; b = 158;
  } else if (height < 3) {
    r = 194; g = 168; b = 120; // sandy shore
  } else if (height > 120) {
    r = 232; g = 230; b = 223; // snow on the spine
  } else if (height > 85) {
    r = 138; g = 122; b = 104; // bare rock
  } else {
    const green = Math.max(0, Math.min(1, (height - 3) / 70));
    r = Math.round(74 + green * -14 + slope * 30);
    g = Math.round(122 - green * 30 - slope * 12);
    b = Math.round(52 - green * 14);
  }
  // A little patchiness so neighbouring cells never read as a flat grid.
  r = Math.max(0, Math.min(255, r + variation));
  g = Math.max(0, Math.min(255, g + variation));
  b = Math.max(0, Math.min(255, b + variation));
  // Distance haze: far ground melts into the sky.
  r = Math.round(r + (184 - r) * haze);
  g = Math.round(g + (207 - g) * haze);
  b = Math.round(b + (224 - b) * haze);
  return `rgb(${r},${g},${b})`;
}

function drawSky(ctx, width, height, camera, time) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  const horizon = height * 0.55 - camera.pitch * height * 0.35;
  grad.addColorStop(0, '#1f4d8a');
  grad.addColorStop(0.45, '#6fa8d8');
  grad.addColorStop(0.62, '#cfe4f2');
  grad.addColorStop(0.75, '#e8dcc0');
  grad.addColorStop(1, '#7a9a6a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  // Low sun, fixed in the west so the light never changes mid-flight.
  const sun = project(camera, width, height, camera.x - 4000, 900, camera.z - 1200);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
    glow.addColorStop(0, 'rgba(255,244,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,214,140,0.55)');
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  void time;
}

function drawClouds(ctx, width, height, camera, clouds, time) {
  for (const cloud of clouds) {
    const driftedX = cloud.x + time * cloud.drift;
    const p = project(camera, width, height, driftedX, cloud.y, cloud.z);
    if (!p || p.depth < 30) continue;
    const s = p.scale * cloud.scale;
    if (s < 6) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    for (let i = 0; i < cloud.puffs; i += 1) {
      const ox = (i - cloud.puffs / 2) * s * 0.55;
      const oy = Math.sin(i * 2.3) * s * 0.12;
      ctx.beginPath();
      ctx.ellipse(p.x + ox, p.y + oy, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function hashCell(x, z) {
  let h = ((x / CELL) * 374761393 + (z / CELL) * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function drawTerrain(ctx, width, height, camera) {
  // Grid origin follows the camera's ground position, snapped to the cell.
  const gx = Math.floor(camera.x / CELL) * CELL;
  const gz = Math.floor(camera.z / CELL) * CELL;
  const half = (GRID_CELLS / 2) * CELL;
  const cells = [];
  for (let iz = 0; iz < GRID_CELLS; iz += 1) {
    for (let ix = 0; ix < GRID_CELLS; ix += 1) {
      const x0 = gx - half + ix * CELL;
      const z0 = gz - half + iz * CELL;
      const cx = x0 + CELL / 2;
      const cz = z0 + CELL / 2;
      const dx = cx - camera.x;
      const dz = cz - camera.z;
      cells.push({ x0, z0, depth: dx * dx + dz * dz });
    }
  }
  cells.sort((a, b) => b.depth - a.depth);
  for (const cell of cells) {
    const { x0, z0 } = cell;
    const h00 = terrainHeight(x0, z0);
    const h10 = terrainHeight(x0 + CELL, z0);
    const h01 = terrainHeight(x0, z0 + CELL);
    const h11 = terrainHeight(x0 + CELL, z0 + CELL);
    const p00 = project(camera, width, height, x0, h00, z0);
    const p10 = project(camera, width, height, x0 + CELL, h10, z0);
    const p01 = project(camera, width, height, x0, h01, z0 + CELL);
    const p11 = project(camera, width, height, x0 + CELL, h11, z0 + CELL);
    if (!p00 || !p10 || !p01 || !p11) continue;
    const avg = (h00 + h10 + h01 + h11) / 4;
    const slope = Math.abs(h10 - h00) + Math.abs(h01 - h00);
    const depth = Math.sqrt(cell.depth);
    const variation = (hashCell(x0, z0) - 0.5) * 18;
    const haze = Math.min(0.55, Math.max(0, (depth - 900) / 2600));
    const colour = terrainColour(avg, Math.min(1, slope / 60), variation, haze);
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour; // same-colour stroke closes the antialias seams
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y);
    ctx.lineTo(p10.x, p10.y);
    ctx.lineTo(p11.x, p11.y);
    ctx.lineTo(p01.x, p01.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Water gets a glint line where it meets the shore.
    if (avg < 1.5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawRunway(ctx, width, height, camera, runway, label) {
  const cos = Math.cos(runway.heading);
  const sin = Math.sin(runway.heading);
  const corners = [];
  for (const [along, across] of [
    [-runway.halfLength, -runway.halfWidth],
    [runway.halfLength, -runway.halfWidth],
    [runway.halfLength, runway.halfWidth],
    [-runway.halfLength, runway.halfWidth],
  ]) {
    const x = runway.x + along * sin + across * cos;
    const z = runway.z + along * cos - across * sin;
    corners.push(project(camera, width, height, x, 4.4, z));
  }
  if (corners.some((p) => p === null)) return;
  ctx.fillStyle = '#3a3f46';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes and the threshold bars.
  ctx.strokeStyle = '#f2f2e8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const steps = 12;
  for (let i = 0; i < steps; i += 1) {
    const t0 = -0.9 + (i / steps) * 1.8;
    const t1 = t0 + 0.08;
    const a = project(camera, width, height,
      runway.x + t0 * runway.halfLength * sin, 4.6,
      runway.z + t0 * runway.halfLength * cos);
    const b = project(camera, width, height,
      runway.x + t1 * runway.halfLength * sin, 4.6,
      runway.z + t1 * runway.halfLength * cos);
    if (a && b) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
  ctx.stroke();
  const labelAt = project(camera, width, height, runway.x, 8, runway.z - runway.halfLength - 60);
  if (labelAt && labelAt.depth < 2600) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, labelAt.x, labelAt.y);
  }
}

function drawRing(ctx, width, height, camera, ring, isNext, time) {
  const facing = { x: 0, y: 0, z: 1 };
  const points = [];
  const segments = 26;
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    // Ring plane is vertical and faces along z; the circle itself is x/y.
    const px = ring.x + Math.cos(a) * ring.r;
    const py = ring.y + Math.sin(a) * ring.r;
    const pz = ring.z;
    void facing;
    points.push(project(camera, width, height, px, py, pz));
  }
  if (points.some((p) => p === null)) return;
  const pulse = isNext ? 0.75 + Math.sin(time * 5) * 0.25 : 0.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = isNext ? `rgba(255,176,32,${pulse})` : 'rgba(120,200,255,0.55)';
  ctx.lineWidth = isNext ? 7 : 4;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.strokeStyle = isNext ? '#fff3c4' : '#d6ecff';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (isNext) {
    const centre = project(camera, width, height, ring.x, ring.y, ring.z);
    if (centre) {
      ctx.fillStyle = '#ffb020';
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT RING', centre.x, centre.y - ring.r * centre.scale - 12);
    }
  }
}

function drawPlaneShadow(ctx, width, height, camera, plane) {
  const ground = terrainHeight(plane.x, plane.z);
  const clearance = plane.y - ground;
  if (clearance > 260) return;
  const p = project(camera, width, height, plane.x, ground + 1.5, plane.z);
  if (!p) return;
  // Wingspan-scale, fading as the plane climbs away from the ground.
  const size = Math.max(3, Math.min(46, p.scale * 6));
  const alpha = 0.30 * (1 - clearance / 300);
  ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, size, size * 0.32, -plane.roll * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

// The Courier herself, drawn in screen space as a chase-view sprite:
// high wing, fixed gear, a spinning prop disc, and nav lights that glow.
export function drawAircraft(ctx, width, height, plane, time) {
  const cx = width / 2;
  const cy = height * 0.56;
  const scale = Math.min(width, height) / 620;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.roll * 0.85 + plane.pitch * 0.3);
  ctx.scale(scale, scale);
  const prop = Math.sin(time * 40) * 0.5 + 0.5;

  // Propeller disc, faint and fast.
  ctx.fillStyle = `rgba(200,210,220,${0.10 + prop * 0.10})`;
  ctx.beginPath();
  ctx.ellipse(0, -118, 26, 62, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings: high wing with a slight dihedral, orange tips.
  ctx.fillStyle = '#d97b2b';
  ctx.beginPath();
  ctx.moveTo(-150, -52);
  ctx.lineTo(-138, -78);
  ctx.lineTo(138, -78);
  ctx.lineTo(150, -52);
  ctx.lineTo(118, -40);
  ctx.lineTo(-118, -40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath();
  ctx.moveTo(-118, -40);
  ctx.lineTo(-138, -78);
  ctx.lineTo(138, -78);
  ctx.lineTo(118, -40);
  ctx.closePath();
  ctx.fill();

  // Tailplane and fin.
  ctx.fillStyle = '#c65f1e';
  ctx.beginPath();
  ctx.moveTo(-64, 96);
  ctx.lineTo(-58, 74);
  ctx.lineTo(58, 74);
  ctx.lineTo(64, 96);
  ctx.lineTo(30, 104);
  ctx.lineTo(-30, 104);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, 62);
  ctx.lineTo(8, 62);
  ctx.lineTo(14, 108);
  ctx.lineTo(-14, 108);
  ctx.closePath();
  ctx.fill();

  // Fuselage, seen from behind and above: cream body, teal stripe.
  ctx.fillStyle = '#f7f3e8';
  ctx.beginPath();
  ctx.moveTo(-26, -108);
  ctx.quadraticCurveTo(-34, -40, -28, 40);
  ctx.quadraticCurveTo(-24, 96, 0, 108);
  ctx.quadraticCurveTo(24, 96, 28, 40);
  ctx.quadraticCurveTo(34, -40, 26, -108);
  ctx.quadraticCurveTo(0, -122, -26, -108);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1f7a6d';
  ctx.beginPath();
  ctx.moveTo(-28, -52);
  ctx.lineTo(28, -52);
  ctx.lineTo(30, -34);
  ctx.lineTo(-30, -34);
  ctx.closePath();
  ctx.fill();

  // Cabin windows catching the sun.
  ctx.fillStyle = '#9fc8e8';
  ctx.beginPath();
  ctx.moveTo(-16, -96);
  ctx.lineTo(16, -96);
  ctx.lineTo(20, -66);
  ctx.lineTo(-20, -66);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(-14, -92);
  ctx.lineTo(-2, -92);
  ctx.lineTo(-4, -70);
  ctx.lineTo(-16, -70);
  ctx.closePath();
  ctx.fill();

  // Fixed landing gear.
  ctx.strokeStyle = '#33383e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-20, 44);
  ctx.lineTo(-34, 96);
  ctx.moveTo(20, 44);
  ctx.lineTo(34, 96);
  ctx.stroke();
  ctx.fillStyle = '#22262b';
  ctx.beginPath();
  ctx.ellipse(-36, 100, 9, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(36, 100, 9, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nav lights: red port, green starboard, blinking white tail.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-150, -62, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34c759';
  ctx.beginPath();
  ctx.arc(150, -62, 5, 0, Math.PI * 2);
  ctx.fill();
  if (Math.sin(time * 3) > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 108, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderScene(ctx, width, height, world) {
  const { camera, plane, missionState, clouds, time } = world;
  const showPlane = world.showPlane !== false;
  drawSky(ctx, width, height, camera, time);
  drawTerrain(ctx, width, height, camera);
  for (const runway of RUNWAYS) {
    drawRunway(ctx, width, height, camera, runway, runway.name);
  }
  drawClouds(ctx, width, height, camera, clouds, time);
  if (missionState) {
    missionState.mission.rings.forEach((ring, i) => {
      if (i < missionState.ringIndex) return;
      drawRing(ctx, width, height, camera, ring, i === missionState.ringIndex, time);
    });
  }
  drawPlaneShadow(ctx, width, height, camera, plane);
  if (showPlane && !plane.crashed) drawAircraft(ctx, width, height, plane, time);
}

export { isWater };
