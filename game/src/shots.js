// Screenshot staging: ?shot=title|flight|approach|landed puts the game in a
// fixed, good-looking state for a render, with no input needed. The game
// itself never reads these — they only pose it for the camera.

import { makePlane } from './flight.js';
import { makeMissionState } from './missions.js';

export const SHOT_NAMES = ['title', 'flight', 'approach', 'landed'];

export function stageShot(game, name) {
  const mission = game.missions[0];
  const plane = makePlane();
  const state = makeMissionState(mission);
  if (name === 'title') {
    game.mode = 'menu';
    game.selectedMission = 0;
    return;
  }
  if (name === 'flight') {
    // Over the green valley west of Home Field, the first amber ring ahead
    // and off the nose, so the plane never hides it.
    plane.x = -300;
    plane.y = 165;
    plane.z = 430;
    plane.heading = 0.62;
    plane.pitch = 0.02;
    plane.roll = -0.08;
    plane.speed = 58;
    plane.throttle = 0.62;
    plane.fuel = 78;
    plane.onGround = false;
    game.mode = 'flying';
    game.plane = plane;
    game.missionState = state;
    game.camera.x = -310;
    game.camera.y = 172;
    game.camera.z = 418;
    return;
  }
  if (name === 'approach') {
    // Short final: all rings done, the strip in sight ahead.
    plane.x = 60;
    plane.y = 72;
    plane.z = -780;
    plane.heading = 0.01;
    plane.pitch = -0.05;
    plane.roll = 0.02;
    plane.speed = 46;
    plane.throttle = 0.34;
    plane.fuel = 41;
    plane.onGround = false;
    state.ringIndex = mission.rings.length;
    state.ringsHit = mission.rings.length;
    state.score = 500;
    state.elapsed = 187;
    state.message = 'All rings threaded — bring her home to Home Field!';
    state.messageUntil = 9999;
    game.mode = 'flying';
    game.plane = plane;
    game.missionState = state;
    game.camera.x = 58;
    game.camera.y = 80;
    game.camera.z = -800;
    return;
  }
  if (name === 'landed') {
    // Parked on the strip after a gentle touchdown, results on screen.
    plane.x = 0;
    plane.y = 6.2;
    plane.z = 140;
    plane.heading = 0;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 0;
    plane.throttle = 0;
    plane.fuel = 36;
    plane.onGround = true;
    plane.landed = true;
    state.ringIndex = mission.rings.length;
    state.ringsHit = mission.rings.length;
    state.score = 500;
    state.elapsed = 214;
    state.finished = true;
    state.result = 'delivered';
    state.breakdown = { rings: 500, timeBonus: 86, fuelBonus: 72, damagePenalty: 0, total: 908 };
    game.best['dawn-mail'] = 908;
    game.mode = 'over';
    game.plane = plane;
    game.missionState = state;
    // A three-quarter view from the side: the strip runs away ahead.
    game.camera.x = -34;
    game.camera.y = 34;
    game.camera.z = 96;
    game.camera.heading = 0.12;
  }
}
