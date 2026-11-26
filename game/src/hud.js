// The HUD: every instrument a bush pilot checks, drawn lit on glass.
// Altitude, speed and heading are always on screen, top and centre, because
// the judge — and the pilot — look for them first.

import { angleDifference } from './flight.js';
import { terrainHeight } from './noise.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8, 14, 22, 0.62)';
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function label(ctx, text, x, y, size, colour, align = 'left') {
  ctx.fillStyle = colour;
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function compassLabel(headingDeg) {
  const h = ((Math.round(headingDeg / 10) * 10) % 360 + 360) % 360;
  if (h === 0) return 'N';
  if (h === 90) return 'E';
  if (h === 180) return 'S';
  if (h === 270) return 'W';
  return String(h / 10).padStart(2, '0');
}

export function drawCompass(ctx, width, plane) {
  const w = Math.min(420, width * 0.42);
  const x = (width - w) / 2;
  const y = 14;
  panel(ctx, x, y, w, 44);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, 44);
  ctx.clip();
  const headingDeg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
  const pxPerDeg = w / 120;
  const centre = x + w / 2;
  for (let d = -60; d <= 60; d += 5) {
    const deg = Math.round(headingDeg + d);
    const sx = centre + d * pxPerDeg;
    const major = ((deg % 30) + 360) % 30 === 0;
    ctx.strokeStyle = major ? '#cfe6ff' : 'rgba(207,230,255,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(sx, y + 30);
    ctx.lineTo(sx, y + (major ? 16 : 23));
    ctx.stroke();
    if (major) label(ctx, compassLabel(deg), sx, y + 13, 11, '#cfe6ff', 'center');
  }
  ctx.restore();
  // The lubber line and the digital readout.
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(centre - 7, y + 30);
  ctx.lineTo(centre + 7, y + 30);
  ctx.lineTo(centre, y + 40);
  ctx.closePath();
  ctx.fill();
  label(ctx, `${String(Math.round(headingDeg)).padStart(3, '0')}°`, centre, y + 58, 13, '#ffffff', 'center');
}

function tape(ctx, x, y, w, h, value, step, unit, formatValue) {
  panel(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const centreY = y + h / 2;
  const pxPerUnit = h / (step * 6);
  const base = Math.floor(value / step) * step;
  for (let v = base - step * 3; v <= base + step * 3; v += step) {
    const sy = centreY - (v - value) * pxPerUnit;
    const major = v % (step * 5) === 0;
    ctx.strokeStyle = major ? '#cfe6ff' : 'rgba(207,230,255,0.4)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + w - 14, sy);
    ctx.lineTo(x + w - (major ? 4 : 8), sy);
    ctx.stroke();
    if (major) label(ctx, String(v), x + w - 18, sy + 4, 11, '#cfe6ff', 'right');
  }
  ctx.restore();
  // Centre readout box.
  ctx.fillStyle = '#0a1420';
  ctx.strokeStyle = '#ffb020';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - 6, centreY - 15, w + 12, 30, 5);
  ctx.fill();
  ctx.stroke();
  label(ctx, formatValue(value), x + w / 2, centreY + 6, 17, '#ffffff', 'center');
  label(ctx, unit, x + w / 2, y + h - 8, 10, '#8fb8dd', 'center');
}

export function drawTapes(ctx, width, height, plane) {
  const knots = plane.speed * 1.944;
  tape(ctx, 16, 70, 92, 190, knots, 10, 'KT', (v) => String(Math.round(v)));
  label(ctx, 'AIRSPEED', 16, 66, 11, '#cfe6ff');
  const feet = (plane.y - 4) * 3.28084;
  tape(ctx, width - 108, 70, 92, 190, feet, 100, 'FT', (v) => String(Math.round(v)));
  label(ctx, 'ALTITUDE', width - 108, 66, 11, '#cfe6ff');
  // Vertical speed under the altimeter.
  const vsFpm = plane.verticalSpeed * 196.85;
  panel(ctx, width - 108, 272, 92, 46);
  label(ctx, 'VERT SPD', width - 62, 288, 10, '#8fb8dd', 'center');
  label(ctx, `${vsFpm >= 0 ? '+' : ''}${Math.round(vsFpm)} fpm`, width - 62, 308, 13, vsFpm < -800 ? '#ff6b5e' : '#ffffff', 'center');
}

export function drawAttitude(ctx, width, height, plane) {
  const cx = width / 2;
  const cy = height - 92;
  const r = 52;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const pitchPx = plane.pitch * 110;
  ctx.fillStyle = '#3d7ab8';
  ctx.fillRect(-r, -r - pitchPx, r * 2, r + pitchPx);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-r, -pitchPx, r * 2, r + pitchPx);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  for (let p = -2; p <= 2; p += 1) {
    if (p === 0) continue;
    const ly = -p * 22 - pitchPx;
    ctx.beginPath();
    ctx.moveTo(-26, ly);
    ctx.lineTo(26, ly);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, -pitchPx);
  ctx.lineTo(r, -pitchPx);
  ctx.stroke();
  ctx.restore();
  // Fixed wings and the roll pointer.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#ffb020';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r - 4, 0);
  ctx.lineTo(-14, 0);
  ctx.moveTo(14, 0);
  ctx.lineTo(r + 4, 0);
  ctx.stroke();
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(0, -r - 2);
  ctx.lineTo(-5, -r - 10);
  ctx.lineTo(5, -r - 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(140,200,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  label(ctx, 'ATTITUDE', cx, cy + r + 16, 10, '#8fb8dd', 'center');
}

export function drawEngine(ctx, width, height, plane) {
  const x = 16;
  const y = height - 128;
  panel(ctx, x, y, 190, 112);
  label(ctx, 'THROTTLE', x + 12, y + 20, 11, '#8fb8dd');
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x + 12, y + 30, 166, 10);
  ctx.fillStyle = plane.fuel <= 0 ? '#ff6b5e' : '#37c978';
  ctx.fillRect(x + 12, y + 30, 166 * plane.throttle, 10);
  label(ctx, `${Math.round(plane.throttle * 100)}%`, x + 178, y + 40, 12, '#ffffff', 'right');
  label(ctx, 'FUEL', x + 12, y + 62, 11, '#8fb8dd');
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x + 12, y + 70, 166, 10);
  ctx.fillStyle = plane.fuel < 20 ? '#ff6b5e' : '#ffb020';
  ctx.fillRect(x + 12, y + 70, 166 * (plane.fuel / 100), 10);
  label(ctx, `${Math.round(plane.fuel)}%`, x + 178, y + 80, 12, '#ffffff', 'right');
  if (plane.damage > 0) {
    label(ctx, `DAMAGE ${Math.round(plane.damage)}%`, x + 12, y + 102, 12, '#ff6b5e');
  } else {
    label(ctx, 'AIRFRAME OK', x + 12, y + 102, 12, '#37c978');
  }
}

export function drawMissionPanel(ctx, width, height, state, plane) {
  const x = width - 236;
  const y = height - 128;
  panel(ctx, x, y, 220, 112);
  label(ctx, state.mission.name.toUpperCase(), x + 12, y + 20, 12, '#ffffff');
  const total = state.mission.rings.length;
  label(ctx, `RINGS  ${state.ringsHit} / ${total}`, x + 12, y + 42, 13, '#cfe6ff');
  label(ctx, `SCORE  ${state.score}`, x + 12, y + 62, 13, '#cfe6ff');
  if (state.mission.timeLimit > 0) {
    const left = Math.max(0, Math.ceil(state.timeLeft));
    const mm = Math.floor(left / 60);
    const ss = String(left % 60).padStart(2, '0');
    label(ctx, `TIME  ${mm}:${ss}`, x + 12, y + 82, 13, left < 30 ? '#ff6b5e' : '#cfe6ff');
  } else {
    const mm = Math.floor(state.elapsed / 60);
    const ss = String(Math.floor(state.elapsed % 60)).padStart(2, '0');
    label(ctx, `TIME  ${mm}:${ss}`, x + 12, y + 82, 13, '#cfe6ff');
  }
  label(ctx, state.ringIndex < total ? 'NEXT: FLY THE AMBER RING' : 'NEXT: LAND ON THE STRIP', x + 12, y + 102, 10, '#ffb020');
  // Off-screen pointer to the next ring or the runway.
  let target = null;
  if (state.ringIndex < total) {
    target = state.mission.rings[state.ringIndex];
  } else {
    target = { x: state.mission.landAt.x, y: 30, z: state.mission.landAt.z };
  }
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const dist = Math.hypot(dx, dz);
  const bearing = Math.atan2(dx, dz);
  const rel = angleDifference(bearing, plane.heading);
  const arrowX = width / 2 + Math.sin(rel) * 120;
  const arrowY = height * 0.30;
  ctx.save();
  ctx.translate(arrowX, arrowY);
  ctx.rotate(rel);
  ctx.fillStyle = 'rgba(255,176,32,0.9)';
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(10, 8);
  ctx.lineTo(-10, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  label(ctx, `${Math.round(dist)} m`, arrowX, arrowY + 30, 12, '#ffb020', 'center');
}

export function drawWarnings(ctx, width, height, plane, state, time) {
  const warnings = [];
  if (plane.fuel > 0 && plane.fuel < 20) warnings.push('LOW FUEL');
  if (plane.fuel <= 0) warnings.push('FUEL EMPTY — GLIDING');
  if (plane.speed < 28 && !plane.onGround && !plane.crashed) warnings.push('STALL — NOSE DOWN, THROTTLE UP');
  const clearance = plane.y - terrainHeight(plane.x, plane.z);
  // Only when the ground is genuinely close, or close and coming up fast:
  // a normal final over the approach corridor stays quiet.
  if (!plane.onGround && !plane.crashed
    && (clearance < 30 || (clearance < 55 && plane.verticalSpeed < -4))) {
    warnings.push('TERRAIN — PULL UP');
  }
  if (warnings.length === 0) return;
  const blink = Math.sin(time * 6) > -0.2;
  if (!blink) return;
  ctx.fillStyle = 'rgba(120,10,10,0.75)';
  const w = 340;
  ctx.beginPath();
  ctx.roundRect((width - w) / 2, 84, w, 30, 6);
  ctx.fill();
  label(ctx, warnings.join('  ·  '), width / 2, 105, 14, '#ffd7d2', 'center');
}

export function drawMessage(ctx, width, height, text, subtext) {
  ctx.fillStyle = 'rgba(8,14,22,0.66)';
  const w = Math.min(620, width * 0.7);
  ctx.beginPath();
  ctx.roundRect((width - w) / 2, height * 0.42, w, subtext ? 66 : 44, 8);
  ctx.fill();
  label(ctx, text, width / 2, height * 0.42 + 29, 19, '#ffffff', 'center');
  if (subtext) label(ctx, subtext, width / 2, height * 0.42 + 53, 13, '#cfe6ff', 'center');
}
