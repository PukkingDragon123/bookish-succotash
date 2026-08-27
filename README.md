# Ferret Fights Back

A 2D pixel-art, top-down **survival bullet-hell**. You play a black-footed ferret
defending a Yellowstone-inspired basin — its trees, its geysers, its animals and
the other ferrets living in the den — from poachers, logging crews, machines,
and the corporation behind all three: **Les Nest**, whose logo is an empty nest
holding one cracked egg and one dead bird.

You were taken as a kit into a Les Nest laboratory. You spent six hundred and
twelve days in a glass tank in Block C. You came back out with a cybernetic eye,
a seam of stitches down your side, an implant that talks to you, and a beaver
friend you left on the floor of the holding block.

The game opens in that tank, and the first hour of it is you getting out.

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

It runs on phones and tablets. The internal resolution is chosen per device so
the picture fills the screen at a whole-number pixel scale, and touch brings up
twin thumbsticks plus a ring of action buttons that only shows the ones that do
something where you are standing.

## Controls

| | |
|---|---|
| **WASD / arrows** | move |
| **Mouse** | aim · **hold left** to fire |
| **X** | **claw** — a real melee swing, and the only weapon you start with |
| **Space** | dash. Time it into a bullet and it is a **graze**; time it out of a claw swing and it is a **parry** |
| **Right mouse** | **Overclock** — burns your own health for fire rate and damage |
| **Shift** | focus-walk (slow, precise; your hitbox is tiny) |
| **E** | talk · accept · gather · chop · mine · loot a wreck · fill water · pick up a trapped animal |
| **Q** | **Scan pulse** — the lab eye. Marks enemies for +20% damage and lights up nearby ore |
| **R** | throw water where you are aiming (puts fires out) |
| **F** | eat berries / use salve |
| **G** | smoke bomb, or wake a geyser once Thermal has wired the field |
| **T / Y / H** | squad: command mode · rally · hold · **1–6** filters by role |
| **1–5 / wheel** | switch weapon |
| **Tab** | crafting · **C** chips · **M** map · **Esc** pause · **F1** perf readout |

### Skill, not just aim

Three things separate surviving a screen full of bullets from dying in it:

- **Dodge.** Dashing through a bullet without touching it is a *graze*: it
  builds a combo that raises your damage and refunds stamina.
- **Parry.** A claw swing opens a window. A hostile round caught inside that
  window is turned around and sent back at double damage — triple if you
  catch it in the first ninety milliseconds.
- **Melee.** Claws cost stamina and hit in an arc. Against anything armoured
  they are usually a worse idea than they feel like.

## The story

Choosing **BEGIN** on the title screen starts the campaign in Block C:

1. **The tank.** You wake in the glass. Dax, a beaver two years into chewing
   through his own tank seal, introduces himself through the pane.
2. **The chair.** The lights in Block C go out. The room goes quiet. And then
   you hear it, a long way off, coming down the hall: **Aldous Vane**, Chief
   Executive, Les Nest Holdings — a failing man in a powered chair, kept
   running by the same division that keeps you running. He has been watching
   you sleep through the eye he put in your head. He does not raise his voice
   once. When Dax objects, Vane presses a button on the arm of the chair, and
   Dax stops objecting.
3. **The course.** He orders you to run it, and tells you in advance that you
   will not be fed. He is not lying. You run the whole thing, reach the dish,
   and somebody has washed it and put it back — and then he asks you, politely,
   to run it again, from the gate, on an exhaustion meter that does not reset.
   He narrates both laps over the PA in a level voice. He is not angry with
   you. He is taking notes.
4. **The plan.** Dax hits it low, you hit it high, same moment, every time.
5. **The break.** Mash. The pane goes.
6. **The shot.** The alarm brings a guard, and the guard shoots Dax in front of
   you. There is blood, and there is a floor that keeps it.
7. **Feral.** You take him apart with your claws, and then you take his gun.
   The implant in your head wakes up and starts talking. It has been counting
   the days with you.
8. **The rampage.** Holding block, corridor, the surgery they used on you, the
   security wing, the roof — with Vane on the PA the whole way, telling his
   people not to close any doors and not to damage the head.
9. **The transport.** You fly it. You are not a pilot. It comes down in a
   basin somewhere north, which is where the rest of the game happens.

You can skip all of it from the menu and start in the basin instead. Tap **E**
to move a line along; it never skips a beat that is waiting on you.

### The building

Block C is not a set of corridors with a guard in it. Every room is dressed:
gurneys with the straps still buckled, IV stands, specimen shelves, pipe runs
along the ceiling, floor drains where you would rather there were not floor
drains, biohazard signs, a mop bucket, an incinerator with the fire visible
behind the hatch.

A lot of it you can press **E** on:

- **Terminals** print what the building thinks of you. Course times. The
  procedure log for day 88, which notes that anaesthesia interferes with nerve
  mapping and that you were conscious for six hours and twenty minutes.
- **Specimen jars** hold the ones before you. Subject 12, terminated day 40.
  The labels are printed in advance.
- **Lockers** can be forced for rounds, salve and scrap.
- **Vents** are the good one. You are forty centimetres of spine and the
  building is full of ducts wider than you are, and somebody at Les Nest did
  not cost that in. Three duct runs link Block C to the service corridor, the
  course gallery to the security wing, and the surgery to the east stair — so
  the rampage has real routing: skip a room, flank a group, or go round the
  thing you cannot fight yet.

### The ferret

Every other animal in the game is baked into sprite sheets. She is not.

A black-footed ferret is forty centimetres of spine with very short legs bolted
underneath, and it does not walk, it flows — so she is a rig solved fresh every
frame. Fifteen spine nodes trail the nose under a hard length constraint and a
per-joint bend limit, which means turning sends a whip down the body a joint at
a time. A travel-driven phase (not a timer) runs a bound wave along the back,
so the gait speeds up because you are moving, not the other way round. The four
feet are placed by inverse kinematics: a paw plants, the body travels over it,
and it only swings forward once it has been left too far behind, which is why
the legs never skate.

She is small. Deliberately, conspicuously small — a thin pale streak with a
black tail-tip and one eye that is not hers, moving through a forest full of
things very much larger than she is.

### The first fight, which you lose

Les Nest follows the transport down. What arrives is not a wave — it is a
survey team with an armoured escort, and their plate does not care about a
stolen seed popper. The fight is scripted and you lose it. They take eleven
trees and two of the others while you are on the ground.

Getting back up is a button press, and it is worth **+25 health, +25% damage and
+8% speed** permanently. The implant is blunt about why you lost: you fought
alone, with what you stole. Everything after that is about not doing that again.

## The loop

**Prep → assault → prep.** A countdown at the top of the screen tells you
exactly how long you have before the next wave arrives, and what is in it.
Spend that time gathering; spend the assault staying alive.

### You arrive with nothing, and nothing is built

There is no base. The clearing the transport came down next to is a clearing:
bare ground, two stumps and room for things that do not exist yet. No den, no
workbench, no forge, no fire. The crafting screen opens and tells you so.

Everything is behind somebody else's hands. Walk up to a neighbour, ask, and
then go and find what they want:

| structure | who builds it | wants | what it opens |
|---|---|---|---|
| **Fire Pit** | Ember | 6 wood, 4 stone | somewhere warm — standing at it heals you |
| **Workbench** | Brindle | 12 wood, 6 stone | gunpowder and rounds |
| **The Den** | Juniper | 16 wood, 10 fibre | somewhere to wake up when you fall |
| **Forge** | Thermal | 14 stone, 6 iron, 4 wood | weapons and charcoal |
| **Drying Rack** | Doc Quill | 8 wood, 6 fibre | better salve |
| **Palisade** | Bramble | 20 wood, 10 stone | cover around the camp |

They do not hand you a menu. They walk over to the plot, and you watch them
build it — sawdust, hammer blows, four to seven seconds of somebody doing you a
favour — and then the thing is standing there.

Each one needs the one before it, so the camp goes up in an order, and the order
is a story: fire first, because you are shaking; then a bench, because Brindle
will not watch you try to make powder on a rock.

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
| **Tamarack** | lynx trapper, dry | snare lines that only catch people |
| **Pitch** | weasel runner, wry | ammo caches wherever you end up |
| **Slate** | marmot quarrier, blunt | rockfall, and knows every seam of ore |
| **Cinder** | raven firewatch, grim | sees the smoke before you do |
| **Willow** | beaver forester, patient | replants, and counts them |
| **Rill** | ferret kit, small | too young for this and entirely undeterred |

They talk about what is actually happening. A wave starting, the basin
catching fire, a building going up, you walking around on a quarter of your
health — each one has a line for it in their own voice, and sixteen different
reactions to the same event is what makes the basin feel inhabited rather than
staffed.

### The animals

Twenty-two species live in the basin, and every one is built from a skeleton
rather than a stack of ellipses: a spine with the right slope from croup to
withers for the species, a scapula and a femur hung off it, limbs with real
joint counts, and a skull that is a cranium plus a muzzle with a stop between
them.

Posture does the rest. A bear puts its whole foot down, a wolf walks on its
toes, an elk walks on one nail — plantigrade, digitigrade and unguligrade give
you three completely different silhouettes out of the same leg length, and
getting that right is most of what "looks like the animal" means at this size.
Prey carry their eyes on the side of the skull and predators at the front,
which does more for recognition than colour ever does. **Bison, moose, bear, elk, pronghorn, bighorn,
wolf, coyote, fox, hare, squirrel, hedgehog, marmot, pika, beaver, otter,
raven, magpie, eagle, crane** and two kinds of ferret.

They do not all react the same way when the trucks arrive:

| temperament | who | what they do |
|---|---|---|
| **flee** | hare, pika, marmot, squirrel | scatter, and keep scattering |
| **skittish** | pronghorn, crane, magpie | bolt, circle back, bolt again |
| **bold** | bison, moose, bighorn | hold ground, and charge what pushes them |
| **defensive** | hedgehog, beaver, otter | dig in where they are |
| **pack** | wolf, coyote | flank, and only commit with numbers |
| **aggro** | bear, eagle | go straight at it |

### Faces

Every character carries an expression on top of whatever its body is doing, so
an animal can be sprinting and frightened at the same time. Eyes, lids, brows,
mouth and ear set all move: a wolf that has decided to fight has its brows in
and its lip off its teeth, a hare that has seen you shows the whites of its
eyes, a companion at full trust pants happily behind you, and Doc Quill
concentrates while she is building your drying rack.

None of it is stored anywhere. Expression is read off the situation — health,
AI state, what the animation is doing — so it is always telling the truth.

### Trust, tools and orders

Feed an animal and it remembers. Trust is a real number per animal: at **50**
it bonds and follows you, at **100** it is devoted and will not leave. Bonded
animals fight, and what they are good at depends on what they are — a bear is a
wall, a wolf is a flank, a raven spots for you, a hedgehog is a mobile minefield.

You can also **mod them**. Craft a tool at the workbench and fit it:

| tool | what it does |
|---|---|
| **harness** | straps a gun to them — they shoot |
| **plate** | +60 health, and slower |
| **chip** | +50% melee damage |
| **pack** | they forage while they follow you |
| **lamp** | they carry a light |

Press **T** for command mode and the game becomes top-down army control: drag a
box or tap a spot to order a **move**, **hold** or **attack**, filter the order
to one role with **1–6**, **Y** to rally everyone back to you, **H** to make
them hold where they stand.

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
  art/             the pixel-drawing DSL and every sprite in the game: one
                   parameterised critter rig drives the player, ten NPCs and
                   the humans; a second, higher-detail beast rig drives all
                   twenty-two wild species; separate builders for machines,
                   flora, items, insects and the laboratory
  world/           value noise, tile definitions, procedural basin generation,
                   chunked terrain rendering, the fire simulation, and the
                   hand-laid Les Nest facility
  entities/        player, bullets, enemies, NPCs, wildlife, pickups, hazards
  story/           cutscene timeline player, the nine-chapter campaign, and
                   the scripted first defeat
  systems/         resource/weapon/chip/recipe data, inventory, animal tools,
                   squad orders, wave director
  ui/              HUD, dialogue bubbles, crafting/chip/map panels
tools/             headless test harnesses (see below)
```

A few things worth knowing if you go reading:

- **The player is the exception to everything else here.** `art/ferret.js` is
  a live rig, not a sheet: no cached frames, no animation states, just a
  constrained spine and four IK feet re-solved each frame and painted as
  perpendicular spans along the body so the silhouette stays clean at any
  angle. The outline is a second pass one pixel wider rather than a
  `getImageData` edge trace, which is what makes drawing it live affordable.
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
- **The internal resolution is not fixed.** `computeViewport` scores every
  whole-number pixel scale against how much of the viewport it would cover and
  picks the best one, so an iPad fills its screen instead of sitting in black
  bars. `VIEW_W`/`VIEW_H` are live module bindings that everything reads each
  frame, so a rotation just works.
- **The lab is not generated.** The story needs to know exactly where your tank
  is and which corridor the guard comes down, so `world/lab.js` lays the floor
  plan by hand into the same `World` object the basin uses — same collision,
  same chunk renderer, same draw list.
- **The basin is not built until you need it.** The game boots into the
  facility; the 460×380 basin (about 27,000 resource nodes and 1,200 animals) is
  generated in ~380ms when the campaign hands over.
- **The camera sits a long way back.** The internal resolution targets 420
  game pixels of height rather than 260, so you see roughly two and a half
  times as much basin at once and the ferret is small in the middle of it. The
  sprites went up to match: the wildlife rig draws at 1.9× and the critter rig
  at 1.5×, so the extra screen space is spent on detail rather than emptiness.
- **Touch controls are measured in screen pixels, not game pixels.** A thumb is
  about 44 CSS pixels wide whatever the game is rendering at, so the buttons
  invert the display scale and come out the same physical size on a phone, an
  iPad and a desktop browser. Each one is an icon rather than a three-letter
  label, because you cannot read three letters under your own thumb in a
  firefight.

## Tests

The harnesses drive the real game in headless Chromium.

```sh
npm start &                  # serve on :8080
export URL=http://localhost:8080/index.html
export ART_URL=http://localhost:8080/tools/artcheck.html

npm test                     # end-to-end checks: the empty camp and asking
                             # somebody to build it, gathering, crafting, the
                             # handover, recruiting, chip theft, rescues, waves,
                             # the burn, all three bosses, and a 40-enemy
                             # frame-rate floor
npm run story                # plays the whole campaign: walks the tutorial,
                             # runs the course, mashes out of the tank, fights
                             # the rampage, flies the transport, lands
npm run mobile               # four device viewports: phone, tablet, both
                             # orientations — checks the picture fills the
                             # screen and the thumbsticks land in reach
npm run smoke                # boots, plays for a while, asserts no console errors
npm run scenes               # magnified gameplay screenshots
npm run artsheet             # contact sheet of every sprite in the game
```

They need Playwright (`npm install`) and default to port 8099; set `URL` to
point them at whatever you are serving on.

## License

MIT.
