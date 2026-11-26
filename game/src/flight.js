// The flight model for Skyline Courier: an arcade bush-plane feel where
// throttle sets speed, roll banks the turn, and pitch trades speed for height.
// State is plain data so the menu, the screenshot stager and the HUD can all
// read it without touching the renderer.

export const STALL_SPEED = 28; // m/s, below this the wing stops flying
export const MAX_SPEED = 92; // m/s at full throttle, level flight

export function makePlane() {
  return {
    // World position in metres: x east, z north, y up.
    x: 0,
    y: 8,
    z: -330,
    heading: 0, // radians, 0 = north, grows clockwise
    pitch: 0, // radians, positive = nose up
    roll: 0, // radians, positive = bank right
    speed: 0, // m/s
    throttle: 0, // 0..1
    fuel: 100, // percent
    damage: 0, // percent, 100 = wrecked
    verticalSpeed: 0, // m/s, for the HUD and the landing check
    onGround: true,
    landed: false,
    crashed: false,
    crashReason: '',
    airTime: 0,
  };
}

export function forwardVector(plane) {
  const cp = Math.cos(plane.pitch);
  return {
    x: Math.sin(plane.heading) * cp,
    y: Math.sin(plane.pitch),
    z: Math.cos(plane.heading) * cp,
  };
}

// One physics step. `input` is { pitch, roll, throttleDelta } in -1..1,
// `wind` is { x, z } in m/s, `dt` is seconds. Returns an event string or ''.
export function stepFlight(plane, input, wind, dt, terrainAt) {
  if (plane.crashed || plane.landed) return '';

  // Throttle: Shift/W raise it, Ctrl/S lower it; it eases, it never jumps.
  plane.throttle = Math.max(0, Math.min(1, plane.throttle + input.throttleDelta * dt * 0.55));
  const hasFuel = plane.fuel > 0;
  const effectiveThrottle = hasFuel ? plane.throttle : 0;

  // Speed chases the throttle's target; drag grows with the square of speed.
  // On the strip there is no idle glide speed: throttle 0 means rolling
  // resistance wins and the plane slows to a stop.
  const targetSpeed = plane.onGround
    ? effectiveThrottle * MAX_SPEED
    : 30 + effectiveThrottle * (MAX_SPEED - 30);
  const drag = 0.0016 * plane.speed * plane.speed;
  let accel = (targetSpeed - plane.speed) * 0.55 - drag;
  // Climbing bleeds speed, descending buys it back.
  accel -= Math.sin(plane.pitch) * 9.5;
  plane.speed = Math.max(0, plane.speed + accel * dt);

  // Roll and pitch ease toward what the pilot asks for.
  const targetRoll = input.roll * 1.05;
  const targetPitch = input.pitch * 0.38;
  plane.roll += (targetRoll - plane.roll) * Math.min(1, dt * 3.2);
  const stalled = plane.speed < STALL_SPEED;
  const pitchAuthority = stalled ? 0.25 : 1;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, dt * 2.4 * pitchAuthority);
  // A stalled wing drops the nose on its own.
  if (stalled && !plane.onGround) plane.pitch -= dt * 0.25;

  // A banked turn: heading rate follows the coordinated-turn rule.
  const turnRate = (9.81 * Math.tan(plane.roll)) / Math.max(plane.speed, 18);
  plane.heading += turnRate * dt;

  const fwd = forwardVector(plane);
  const groundHeight = terrainAt(plane.x, plane.z);

  if (plane.onGround) {
    // Rolling on the strip: steer with the rudder, lift off past rotate speed.
    plane.heading += input.roll * dt * 0.5;
    plane.x += fwd.x * plane.speed * dt;
    plane.z += fwd.z * plane.speed * dt;
    plane.y = groundHeight + 2.2;
    if (plane.speed > 34 && plane.pitch > 0.06) {
      plane.onGround = false;
      return 'rotate';
    }
  } else {
    let climb = plane.speed * Math.sin(plane.pitch);
    if (stalled) climb -= (STALL_SPEED - plane.speed) * 0.9;
    plane.verticalSpeed = climb;
    plane.x += (fwd.x * plane.speed + wind.x) * dt;
    plane.y += climb * dt;
    plane.z += (fwd.z * plane.speed + wind.z) * dt;
    plane.airTime += dt;
  }

  // Fuel: the engine drinks with the throttle; empty tanks mean a glider.
  if (hasFuel) {
    plane.fuel = Math.max(0, plane.fuel - (0.16 + effectiveThrottle * 0.62) * dt);
  }

  // The ground is the one thing you cannot argue with.
  const clearance = plane.y - groundHeight;
  if (clearance <= 1.2) {
    return groundContact(plane, groundHeight);
  }
  return '';
}

function groundContact(plane, groundHeight) {
  plane.y = groundHeight + 1.2;
  if (plane.onGround) return '';
  const sink = -plane.verticalSpeed;
  const runway = runwayUnder(plane);
  const aligned = runway !== null && Math.abs(angleDifference(plane.heading, runway.heading)) < 0.45;
  const gentle = sink < 5.5 && plane.speed < 58;
  if (runway !== null && aligned && gentle) {
    plane.onGround = true;
    plane.landed = false;
    plane.verticalSpeed = 0;
    plane.pitch = 0;
    plane.roll = 0;
    if (sink > 3.2) {
      plane.damage += Math.round((sink - 3.2) * 14);
      if (plane.damage >= 100) {
        plane.crashed = true;
        plane.crashReason = 'The landing gear folded on a hard touchdown.';
        return 'crash';
      }
      return 'hard-landing';
    }
    return 'touchdown';
  }
  if (groundHeight < 1.5) {
    plane.crashed = true;
    plane.crashReason = 'Ditched in the lake — the Courier never floats.';
    return 'crash';
  }
  plane.crashed = true;
  plane.crashReason = sink > 8
    ? 'Flew straight into the hillside.'
    : 'Clipped the terrain on the way down.';
  return 'crash';
}

// Which runway strip, if any, the plane is over right now.
export function runwayUnder(plane) {
  const runways = [
    { x: 0, z: 0, halfLength: 380, halfWidth: 26, heading: 0 },
    { x: 2600, z: 4300, halfLength: 340, halfWidth: 24, heading: 0.35 },
  ];
  for (const runway of runways) {
    const dx = plane.x - runway.x;
    const dz = plane.z - runway.z;
    // Same frame as the renderer: along runs down the strip, across over it.
    const along = dx * Math.sin(runway.heading) + dz * Math.cos(runway.heading);
    const across = dx * Math.cos(runway.heading) - dz * Math.sin(runway.heading);
    if (Math.abs(along) < runway.halfLength && Math.abs(across) < runway.halfWidth) {
      return runway;
    }
  }
  return null;
}

export function angleDifference(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// After a touchdown the plane rolls out and stops; returns true when still.
export function stepRollout(plane, dt, terrainAt) {
  if (!plane.onGround || plane.crashed) return;
  plane.speed = Math.max(0, plane.speed - 9 * dt);
  const fwd = forwardVector(plane);
  plane.x += fwd.x * plane.speed * dt;
  plane.z += fwd.z * plane.speed * dt;
  plane.y = terrainAt(plane.x, plane.z) + 2.2;
  plane.throttle = 0;
  // Only a plane that actually flew counts as landed: a sortie that never
  // left the strip is still waiting for its takeoff roll.
  if (plane.speed < 0.5 && plane.airTime > 1 && !plane.landed) {
    plane.landed = true;
  }
}
