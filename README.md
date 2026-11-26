# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/s8fr2hf/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/s8fr2hf/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Skyline Courier** — a bush-plane courier game. Fly the amber rings over a lake, a river valley and a mountain spine, mind the fuel gauge, then put the Courier down gently on the strip. Three sorties: a dawn mail run, a ridge crossing to a far strip, and a four-minute storm deadline with a crosswind. Chase camera, live HUD (airspeed, altitude, heading, attitude, fuel, vertical speed), procedural terrain, and a flight model that rewards throttle and turn discipline.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network requests — `game/` is plain static files.

## Controls

- **↑ / ↓** pitch, **← / →** bank
- **Shift / Ctrl** throttle up / down
- **Mouse**: hold the left button and steer toward the pointer
- **P** pause, **R** restart the sortie, **M** mute

## How it plays

Take off from Home Field, thread the amber rings in order, then land on the marked strip. Rings are worth 100 points each; landing gently earns a time and fuel bonus, a hard landing costs airframe damage. Run out of fuel and you glide; stall below 65 kt and the nose drops. Best scores are kept per sortie in your browser.

---

<sub>Entered on [make.fun](https://make.fun/?ref=hwnj64tj&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
