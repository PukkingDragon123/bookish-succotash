# Ferret Fights Back

A 2D pixel-art, top-down **survival bullet-hell**. You play a black-footed ferret
defending a Yellowstone-inspired basin — its trees, its geysers, its animals and
the other ferrets living in the den — from poachers, logging crews, machines,
and the corporation behind all three: **Les Nest**, whose logo is an empty nest
holding one cracked egg and one dead bird.

You were taken as a kit into a Les Nest laboratory. You came back out with a
cybernetic eye, a seam of stitches down your side, and two abilities nobody
asked for.

Everything in the game is generated at runtime. There are no image files, no
audio files, and no dependencies: every sprite is drawn pixel by pixel into an
offscreen canvas at load, every sound is synthesised with WebAudio, and the
basin is built from noise.

## Running it

The game uses ES modules, so it has to be served over HTTP (opening
`index.html` from the filesystem will not work).

```sh
npm start          # python3 -m http.server 8080
```

Then open <http://localhost:8080/>.

Any static server works. Add `?seed=anything` to the URL to replay a specific
basin — the seed is shown on the title screen.

## Controls

| | |
|---|---|
| **WASD / arrows** | move |
| **Mouse** | aim · **hold left** to fire |
| **Right mouse** | **Overclock** — burns your own health for fire rate and damage |
| **Shift** | focus-walk (slow, precise; your hitbox is tiny) |
| **Space** | dash (brief invulnerability) |
| **E** | talk · accept · gather · chop · mine · loot a wreck · fill water · pick up a trapped animal |
| **Q** | **Scan pulse** — the lab eye. Marks enemies for +20% damage and lights up nearby ore |
| **R** | throw water where you are aiming (puts fires out) |
| **F** | eat berries / use salve |
| **G** | smoke bomb, or wake a geyser once Thermal has wired the field |
| **1–5 / wheel** | switch weapon |
| **Tab** | crafting · **C** chips · **M** map · **Esc** pause · **F1** perf readout |

## The loop

**Prep → assault → prep.** A countdown at the top of the screen tells you
exactly how long you have before the next wave arrives, and what is in it.
Spend that time gathering; spend the assault staying alive.

### Gathering and the ten-log rule

Chop trees, mine boulders and ore, pick berries, scrape sulfur and saltpeter out
of the thermal crust. Wood is different from everything else: you carry it
**physically, on your back, ten pieces maximum**. You can see the bundle. A full
load slows you down, and anything past ten falls on the ground.

### Gunpowder

Sulfur and saltpeter come from the geyser basin; charcoal comes from burnt snags
or from slow-burning wood at the forge. Together at a workbench they make
gunpowder, and gunpowder makes every weapon and every round in the game.

### NPCs: ask, fetch, stand still

There are no quest menus. Talk to someone, press **E** again to accept what they
ask for, go find it, then **stand next to them**. The materials physically leave
your pack one piece at a time and arc over to them. They build the thing in
front of you and it lands at your feet.

Three completed requests and they will pick up a gun and follow you.

| | | |
|---|---|---|
| **Brindle** | ferret gunsmith, gruff | heavy slug fire |
| **Juniper** | pine marten botanist, sunny | field healing |
| **Cobalt** | raven tinkerer, sardonic | hijacks an enemy machine |
| **Mossback** | bison elder, stoic | thunder charge |
| **Wisp** | pika scout, frantic | marks targets |
| **Sable** | Les Nest defector, haunted | twin pistols |
| **Thermal** | coyote geologist, excitable | wakes the geysers |
| **Ember** | ferret kit, brave | smoke screens |
| **Doc Quill** | porcupine medic, fussy | quill volley + a second chance |
| **Bramble** | badger digger, blunt | burrow slam |

### Upgrade chips

Machines do not simply drop loot. When you destroy one it leaves a sparking
**wreck**; press **E** on it to rip the upgrade chip out of its head. Chips slot
into your skull — three sockets to start, more if Cobalt is willing — and stack:
damage, fire rate, piercing, ricochet, extra projectiles, a shield, lifesteal,
chain lightning, incendiary rounds.

### Wave 8: THE BURN

Les Nest firebombs the basin. Fire spreads tile to tile, biased by a wind that
shifts while you fight it. Trees standing in it become torches. Animals panic,
and some get cut off — you carry those out one at a time, which means putting
your gun away while bombers are still overhead.

Water thrown from your skin puts fires out and leaves ground too wet to relight,
so firebreaks actually work. Whatever burns is gone; scorched ground greens over
slowly afterwards and lodgepole seedlings come up in the scar, because that is
what lodgepole cones do.

### Bosses

Waves 5, 10 and 15: **RIPSAW PRIME**, **THE KILN**, and **MOTHER NEST** — the
company logo built at industrial scale, a steel nest cradling a cracked reactor
egg with the dead bird bolted to the front as a trophy. Each has three phases
and shifts patterns as its shell cracks. Surviving wave 15 opens endless mode.

## How it is built

No build step, no bundler, no dependencies (Playwright is a dev-only dependency
used by the test harness).

```
index.html
src/
  main.js          entry point; seeds the world and starts the loop
  game.js          owns the world, entity lists, the wave director and the UI
  engine/          fixed-timestep loop, input, pixel renderer + camera,
                   5x7 bitmap font, WebAudio synth, pooled particles
  art/             the pixel-drawing DSL and every sprite in the game:
                   one parameterised critter rig drives the player, ten NPCs,
                   eighteen animals and the poachers; separate builders for
                   machines, flora, items and insects
  world/           value noise, tile definitions, procedural basin generation,
                   chunked terrain rendering, and the fire simulation
  entities/        player, bullets, enemies, NPCs, wildlife, pickups, hazards
  systems/         resource/weapon/chip/recipe data, inventory, wave director
  ui/              HUD, dialogue bubbles, crafting/chip/map panels
tools/             headless test harnesses (see below)
```

A few things worth knowing if you go reading:

- **Sprites are baked, not drawn live.** `art/critters.js` renders each
  animation frame once into a canvas and caches it. Animation comes from
  analytic pose curves with deliberate phase lag between body, head and tail,
  which is what makes the movement read as fluid rather than mechanical.
- **Terrain is chunked.** 8×8-tile blocks are painted once into offscreen
  canvases with per-tile hashed detail and edge dithering, then blitted. Burning
  a tile invalidates its chunk and its neighbours.
- **Fire is a real simulation**, not an animation: per-tile fuel budgets,
  wind-biased spread, wetness that decays, and trees as fuel depots.
- **The bullet pool is flat and shared** by the player, the recruits and every
  enemy pattern. Radial glow sprites are cached per (radius, colour) — building
  a `CanvasGradient` per bullet was the single biggest frame-rate cost in the
  game before that change.

## Tests

The harnesses drive the real game in headless Chromium.

```sh
npm start &                  # serve on :8080
export URL=http://localhost:8080/index.html
export ART_URL=http://localhost:8080/tools/artcheck.html

npm test                     # 24 end-to-end checks: gathering, crafting, the
                             # handover, recruiting, chip theft, rescues, waves,
                             # the burn, all three bosses, and a 50-enemy
                             # frame-rate floor
npm run smoke                # boots, plays for a while, asserts no console errors
npm run scenes               # magnified gameplay screenshots
npm run artsheet             # contact sheet of every sprite in the game
```

They need Playwright (`npm install`) and default to port 8099; set `URL` to
point them at whatever you are serving on.

## License

MIT.
