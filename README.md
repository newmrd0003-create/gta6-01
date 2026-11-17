# SOLARA HEAT — Make GTA 6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/newmrd0003-create/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/newmrd0003-create/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game set in **Costa Solara**, a sun-soaked coastal city, built for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01) ($1,666, shared by the top 100). Leo Marin is back in town owing the harbour crew money, with only one way out: the jobs fixer Marta Solis hands him. Take cars off the street, outrun the Solara PD, run her jobs, and earn your way clear — on foot and behind the wheel, across a whole city.

Every part of this game is its own: the city, the people in it, the cars, the names, the story, the art, the sound and the music — nothing borrowed from any commercial game.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step and no network request — `game/index.html` with its ES modules and a vendored three.js (`game/vendor/three.module.min.js`) runs offline in any desktop browser.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse drag | Look around |
| E | Steal / exit a car |
| Click | Shoot |
| F | Punch |
| H | Horn |
| R | Reload |
| M | Next mission |
| Shift | Sprint / boost |
| Esc | Pause & save |

## What's in the city

- **A city to explore** — a seeded coastal grid of pastel towers with lit windows, pavements and crossings, a central plaza crowned by the Solara Tower, a beach with palms and umbrellas, a marina pier and lighthouse, and a skyline past the playable edge. The same city loads every time.
- **On foot and by car** — third-person walking under a chase camera, and arcade driving with steering, boost, handbrake, skid marks, brake lights and body roll. Wreck your car and it blows out from under you.
- **Traffic and pedestrians** — cars cruise the street grid, turn at intersections and stop for the car ahead; walkers stroll the pavements, idle, and scatter from gunfire, speeding cars and fists. Traffic respawns near you, so the streets stay busy.
- **Stealing cars** — walk up to any parked or moving car and press E. The PD logs the theft.
- **Wanted stars and police** — crimes raise the heat from one to five stars; Solara PD cruisers spawn on the streets, chase, ram, and bust you on foot. Shake them and the heat cools off, one star at a time.
- **Missions and a story** — four jobs from Marta Solis (*Wheels Up*, *Sunset Run*, *Heat Escape*, *Harbour Debt*), each with objectives, a waypoint beacon, timers where they matter, and cash rewards up to $1,200.
- **Combat** — a pistol with muzzle flash and ammo, punches, running pedestrians over (the PD notices), and police cruisers you can shoot back at.
- **HUD and minimap** — health, cash, ammo, wanted stars, the mission objective and timer, speed, a live 2D minimap (streets, towers, waypoint, traffic, flashing police, player arrow), toasts, and a damage flash.
- **Start and save** — a title screen with New Game / Continue, pause, busted/wasted screens, and a localStorage save (cash, health, missions, position, lifetime totals) that survives a restart.
- **Sound** — fully procedural WebAudio: an engine hum, a two-tone siren that fades with distance, a sunset bassline radio, gunshots, punches, crashes, horns and mission stings. No audio files.

## Screenshots

The cover (`1-drive.jpg`) is a chase: two wanted stars, PD cruisers in the mirror, a job on the HUD. Then on foot at the plaza (`2-foot.jpg`), the Sunset Run delivery (`3-mission.jpg`), and full three-star heat (`4-chase.jpg`).

## Layout

```
main.ts                  entry program: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts                 static server for local play (http://localhost:8080)
game/
  index.html             page, HUD, menus, import map to vendored three.js
  vendor/three.module.min.js   three.js r160 (vendored)
  src/
    config.js            tuning, palette, seeded RNG, angle helpers
    main.js              boot, Leo, camera, combat, staging (?scene=)
    city.js              Costa Solara: streets, towers, beach, marina, plaza
    vehicles.js          car meshes + arcade driving
    traffic.js           traffic AI + stealable parked cars
    pedestrians.js       walkers, idlers, panic
    police.js            wanted stars, chase / ram / bust
    missions.js          Marta Solis's four jobs + waypoint beacon
    hud.js               HUD + live minimap + damage flash
    input.js             keyboard + mouse
    audio.js             procedural WebAudio
    save.js              localStorage save (versioned)
screenshots/              4 real renders of the game
```

## License

MIT — see [LICENSE](LICENSE).
