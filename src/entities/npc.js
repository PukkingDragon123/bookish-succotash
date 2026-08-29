// NPCs and the physical handover loop that drives the whole quest system:
//
//   talk -> accept -> gather -> stand next to them -> materials physically fly
//   out of your pack, one piece at a time -> they build the thing -> it pops
//   out and lands at your feet.
//
// No menus, no "turn in quest" button. Favour accumulates with every delivery,
// and once an NPC trusts you enough they will pick up a gun and follow you.

import { NPCS, NPC_ORDER } from '../art/species.js';
import { critterFrames, critterSize } from '../art/critters.js';
import { itemIcon } from '../art/items.js';
import { P } from '../art/palette.js';
import { flashFrames } from '../art/pixel.js';
import { STRUCTURES } from '../systems/camp.js';
import { RESOURCES, randomChipKey } from '../systems/defs.js';
import { TAU, clamp, dist2, angleDiff } from '../engine/math.js';
import { rnd, pick, chance, makeRng } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { isSolid, TILES } from '../world/tiles.js';

export const RECRUIT_FAVOR = 3;   // completed requests needed before they enlist

// --- request tables --------------------------------------------------------
// Each NPC has an escalating chain. `give` is what you get back, physically.
// Things they say about what is actually happening, rather than at random.
// An NPC who comments on the wave that just started, the fire on the ridge, or
// the fact that you finally got them a workbench is a person; one who cycles
// four idle lines forever is furniture.
const REACT = {
  waveIncoming: {
    gruff: "Here they come. Get behind something.",
    sunny: "Oh no. Oh no no no. Right. I'm ready. I'm not ready.",
    sardonic: "And there's the four o'clock. Punctual, I'll give them that.",
    stoic: "Let them come.",
    frantic: "THEYRE COMING THEYRE COMING GO GO GO",
    haunted: "That's the transport note. Two trucks. I know the sound.",
    excitable: "Ooh! Ooh. That's bad. That's a bad ooh.",
    brave: "I'm not scared. I'm NOT.",
    fussy: "Everyone stay where I can see you. I mean it.",
    blunt: "Dig in.",
    dry: "Right on time.",
    wry: "I'd run, but you'd only follow me.",
    grim: "Nine of them. I counted from the ridge.",
    patient: "They always come back to the same slope. Every time.",
    small: "Is it them? IS IT THEM?",
  },
  waveClear: {
    gruff: "That's that. Reload.",
    sunny: "We did it! Everyone in one piece? Everyone?",
    sardonic: "Well. That was invigorating.",
    stoic: "The valley holds.",
    frantic: "WE WON WE WON did we win?",
    haunted: "They'll send more. They always send more.",
    excitable: "Did you SEE the geyser?!",
    brave: "I helped! I did help!",
    fussy: "Right. Line up. I want to look at all of you.",
    blunt: "Good.",
    dry: "Fewer of them than there were.",
    wry: "I'll go and count the bodies. Someone has to keep score.",
    grim: "That was the small one.",
    patient: "Three saplings lost. They'll come back.",
    small: "THAT WAS AMAZING. Can we do it again? Not really.",
  },
  fire: {
    gruff: "Fire. Move the powder. MOVE IT.",
    sunny: "The lupine — the whole north slope — no, no, no—",
    sardonic: "They've set the basin on fire. Of course they have.",
    stoic: "I have seen this before. It came back. It will come back.",
    frantic: "FIREFIREFIRE water WHERE IS THE WATER",
    haunted: "This is what they did to the last valley.",
    excitable: "That's not a geyser! That's the WRONG kind of hot!",
    brave: "I can get the kits. Let me get the kits!",
    fussy: "Burns. There will be burns. I need water and I need it now.",
    blunt: "Firebreak. North side. Dig.",
    dry: "Wind's from the west. It'll take the ridge first.",
    wry: "I'll run the line. Try to keep up.",
    grim: "I told you it would burn again. I hate being right.",
    patient: "Two hundred and six. Please. Please not the north slope.",
    small: "I'm scared. I'm really scared.",
  },
  built: {
    gruff: "Proper bench. Now we can work.",
    sunny: "It's starting to look like somewhere!",
    sardonic: "A camp. How rustic. I approve, which surprises me.",
    stoic: "A place. Good. A place is worth defending.",
    frantic: "IT'S SO GOOD I LOVE IT",
    haunted: "It's the first thing I've seen built in six years.",
    excitable: "Now do the forge! Do the forge next!",
    brave: "Is that ours? Is it OURS?",
    fussy: "Finally. I can put things DOWN.",
    blunt: "Solid. Won't fall over.",
    dry: "Better than the hole I was living in.",
    wry: "A whole building. And they said you were feral.",
    grim: "Something worth standing in front of. Hm.",
    patient: "Good wood. Well used.",
    small: "IS THAT OURS? IT'S OURS!",
  },
  outpostFound: {
    gruff: "That's one of theirs. Mast, drums, wire. Take it apart.",
    sunny: "Oh, that's them. That's — no, no, that's them, isn't it.",
    sardonic: "Ah. They've put up a shed. How permanent of them.",
    stoic: "It stands where nothing should stand. So it will not.",
    frantic: "THAT'S THEIRS THAT'S THEIRS DON'T GO IN THERE go in there",
    haunted: "I helped them build one of those. Before. I know where the fuel goes.",
    excitable: "Can we blow it up? Please say we can blow it up.",
    brave: "I'll go with you. I will. Ask me.",
    fussy: "Don't just run at it. Look at it first. LOOK at it.",
    blunt: "Burn it.",
    dry: "Somebody's put a mast on our hill. Bold.",
    wry: "I'd say it improves the view, but I'd be lying twice.",
    grim: "Six of them inside. I counted the boots, not the men.",
    patient: "It has been there four months. It can be gone by evening.",
    small: "Is that where they take them? Is it?",
  },
  outpostRazed: {
    gruff: "Good. That's one less thing calling them in.",
    sunny: "IT'S DOWN! Did you see it come DOWN?",
    sardonic: "Well. That'll want explaining on someone's quarterly.",
    stoic: "The ground remembers. It will grow over.",
    frantic: "IT FELL OVER IT ACTUALLY FELL OVER",
    haunted: "It's quieter. I hadn't noticed the noise until it stopped.",
    excitable: "AGAIN! Let's do another one! Is there another one?",
    brave: "We did that. We. Including me.",
    fussy: "Right. Now sit down and let me look at those cuts.",
    blunt: "One down.",
    dry: "Their signal's down. Their signal was the loudest thing in the county.",
    wry: "I'll write to them and express my sympathies.",
    grim: "Five left. Then we can talk about what comes after.",
    patient: "The aspen will be back on that slope in nine years.",
    small: "Did we WIN? Is that winning?",
  },
  allied: {
    gruff: "Whole herd came over the rise. Never seen that.",
    sunny: "THEY CAME! THEY CAME FOR US!",
    sardonic: "I have never been so pleased to be surrounded by wildlife.",
    stoic: "The basin stands together. As it should.",
    frantic: "THERE'S SO MANY OF THEM ARE THEY OURS THEY'RE OURS",
    haunted: "They don't come to people. They never came to people.",
    excitable: "There's a BISON. There's a bison ON OUR SIDE.",
    brave: "I'm not scared of any of them. Mostly.",
    fussy: "Nobody trample the beds. NOBODY TRAMPLE THE BEDS.",
    blunt: "Good. More of us.",
    dry: "So that's what you've been doing with the berries.",
    wry: "You've made friends. I'm almost proud, and I don't do proud.",
    grim: "Then it isn't just us any more.",
    patient: "They remember who fed them. They always did.",
    small: "THEY'RE ON OUR SIDE! THEY'RE ON OUR SIDE!",
  },
  lowHp: {
    gruff: "You're leaking. Sit down.",
    sunny: "You're hurt! Doc! DOC!",
    sardonic: "You look like a rug someone lost an argument with.",
    stoic: "Rest. The valley will still be here.",
    frantic: "YOU'RE BLEEDING you're bleeding okay okay okay",
    haunted: "I've seen that colour before. Sit down.",
    excitable: "That's a LOT of red. Is that normal? That's not normal.",
    brave: "I'll hold them off! You rest!",
    fussy: "Sit. DOWN. I am not asking.",
    blunt: "Stop. Bleed later.",
    dry: "You're going to fall over. Do it near me and I'll drag you back.",
    wry: "I could carry you, but I'd never let you forget it.",
    grim: "Not today. Sit.",
    patient: "Everything mends if you let it. Let it.",
    small: "Don't die. Please don't die. You're the only one who lets me help.",
  },
};

const REQUESTS = {
  tamarack: [
    { ask: { fiber: 8, iron: 3 }, give: { items: { meds: 3 } },
      offer: "Their snares are wire on a spring. Mine are fibre and they let go when the animal is heavy enough.\nBring me eight fibre and three iron and I will lay a line that only catches people.",
      done: "Laid. If something screams out there tonight, it is wearing a company jacket." },
    { ask: { scrap: 10, wood: 6 }, give: { turret: true },
      offer: "I have been taking their traps apart for six years. I know what is inside them.\nTen scrap, six logs, and I will build you something that watches the treeline for you.",
      done: "It sits still and it does not blink. Better company than most." },
    { ask: { obsidian: 4, fiber: 10 }, give: { maxHp: 15 },
      offer: "That coat of yours is not going to stop anything. Obsidian and fibre, and I will fix that.",
      done: "Layered. Not armour. But it will turn a graze into a scratch." },
  ],
  pitch: [
    { ask: { ammo: 12 }, give: { items: { ammo: 30 } },
      offer: "Here is how a relay works: you give me twelve rounds, I run them to three caches, and\nwherever you end up there are rounds already there. Yes it is more rounds. That is the trick.",
      done: "Thirty back. Do not ask me how. Actually do, it was a very good week." },
    { ask: { berries: 8, water: 2 }, give: { intel: 1 },
      offer: "I run the ridge line every morning. Feed me and I will tell you what is coming up the road.",
      done: "Two trucks and a walker, four hours out, and one of them has a fuel problem." },
    { ask: { scrap: 12, copper: 4 }, give: { chipSlot: 1 },
      offer: "Cobalt showed me how the sockets go in. I have smaller hands. Trust me, this is an advantage.",
      done: "Socket. Try not to think about how close that was to your brain." },
  ],
  slate: [
    { ask: { stone: 14 }, give: { survey: 1 },
      offer: "Fourteen stone. Not for building. I want to see what is IN them.\nThen I can tell you where the rest of it is, and you can stop digging holes at random.",
      done: "There. Iron north-east, copper along the river, and obsidian where the ground is warm." },
    { ask: { iron: 8, coal: 6 }, give: { weapon: 'sparker' },
      offer: "Iron and coal. There is a thing I have wanted to build since I was a pup and it throws sparks.",
      done: "Do not point it at anything you want to keep. Including your own tail." },
    { ask: { obsidian: 6, stone: 20 }, give: { barricade: 2 },
      offer: "Twenty stone and six obsidian and I will put a wall around this camp that they have to work at.",
      done: "Dry stone, obsidian keyed. It will hold. I built it." },
  ],
  cinder: [
    { ask: { water: 4, fiber: 6 }, give: { items: { water: 6 } },
      offer: "I can see the whole basin from up there. What I cannot do is carry water to it.\nFour water, six fibre for the slings, and there will be caches where you need them.",
      done: "Six caches. When it burns, you will not be running back to the river." },
    { ask: { charcoal: 8, scrap: 6 }, give: { intel: 2 },
      offer: "Charcoal and scrap. I am building something that tells me where the heat is before you can see it.",
      done: "It watches for smoke. When it screams, you run toward it, not away." },
    { ask: { copper: 6, saltpeter: 8 }, give: { smokeBombs: true },
      offer: "Copper and saltpeter. You want to disappear? I will show you how the crows do it.",
      done: "Three of them. Throw it down, count two, be somewhere else." },
  ],
  willow: [
    { ask: { wood: 10 }, give: { items: { wood: 4, fiber: 8 } },
      offer: "Ten logs. Before you object: I am not taking them, I am planting them.\nGive me a season and the north slope is forest again. Give me ten logs and it is this season.",
      done: "Two hundred and sixteen. I counted." },
    { ask: { water: 3, fiber: 12 }, give: { maxHp: 20 },
      offer: "Willow bark, water, and time. Chew it. It will not fix the stitches but it will stop them hurting.",
      done: "Better? Good. Do not swallow the bark." },
    { ask: { wood: 20, stone: 8 }, give: { revive: 2 },
      offer: "There is a dam that needs to be a dam again. If the water comes back, so does everything else.",
      done: "Listen to that. That is a river doing what a river does." },
  ],
  rill: [
    { ask: { berries: 4 }, give: { items: { berries: 6, meds: 1 } },
      offer: "I'm not allowed to go past the big rock! But YOU are!\nBring me four huckleberries and I'll show you my secret thing. It's a REALLY good secret thing.",
      done: "It's a hollow log full of berries. I've been saving it since spring. You can have some." },
    { ask: { scrap: 6, fiber: 4 }, give: { items: { meds: 3 } },
      offer: "I'm making armour. Out of scrap. For ME. Don't laugh, Bramble laughed and he was WRONG.",
      done: "See? SEE? Okay it fell off. But it worked for a bit!" },
    { ask: { copper: 3, iron: 3 }, give: { maxHp: 10 },
      offer: "Doc Quill says your stitches are going to open if nobody fixes them and everyone's busy,\nso I read the book. All of it. Bring me copper and iron and hold still.",
      done: "I DID IT. I did it! Don't tell Mum I used the needle." },
  ],
  brindle: [
    { ask: { wood: 6, iron: 4 }, give: { weapon: 'scatter' },
      offer: "You want to live through the week, you need more than that seed popper. Bring me six logs and four iron and I'll build you a scattergun.",
      done: "There. Don't point it at anything you like." },
    { ask: { iron: 6, copper: 2, gunpowder: 3 }, give: { items: { ammo: 40 } },
      offer: "Powder, iron, a little copper. I'll run you off a proper box of rounds.",
      done: "Forty rounds. Make them mean something." },
    { ask: { iron: 8, obsidian: 3, wood: 8 }, give: { weapon: 'bolt' },
      offer: "Obsidian, iron, good straight lodgepole. I've been wanting to build a long gun since before they took you.",
      done: "Boltbark. She'll reach the far treeline. Aim small." },
  ],
  juniper: [
    { ask: { berries: 6, fiber: 4 }, give: { items: { meds: 4 } },
      offer: "Huckleberries and sage fibre! I can cook that into a salve that'll close a hole in you.",
      done: "Four tins. Don't be brave about using them." },
    { ask: { berries: 10, fiber: 6 }, give: { maxHp: 20 },
      offer: "If you bring me a proper basket I can work something deeper into those stitches of yours.",
      done: "There. You'll hold together better now. Try to notice." },
    { ask: { berries: 14, water: 2 }, give: { items: { meds: 6 } },
      offer: "One more batch, a big one, and the whole den is stocked.",
      done: "The kits will be fine now. That's because of you." },
  ],
  cobalt: [
    { ask: { scrap: 8, copper: 4 }, give: { chip: true },
      offer: "You keep tearing chips out of those things and staring at them. Bring me scrap and copper and I'll flash you a fresh one.",
      done: "Try not to install it upside down. I've seen you." },
    { ask: { scrap: 14, obsidian: 2 }, give: { chipSlot: 1 },
      offer: "I can solder another socket into that head of yours. It'll hurt. You'll like it.",
      done: "Socket's live. Yes, that smell is normal." },
    { ask: { scrap: 20, copper: 8, gunpowder: 4 }, give: { weapon: 'sparker' },
      offer: "Copper, powder, scrap. I want to build something that makes their machines argue with themselves.",
      done: "Copper Sparker. It jumps. Stand back from your own friends." },
  ],
  mossback: [
    { ask: { wood: 10 }, give: { barricade: 1 },
      offer: "Ten lengths of pine. I will set them around the den. They will slow the machines.",
      done: "It is done. The den has a wall now. Small. Real." },
    { ask: { stone: 14, wood: 8 }, give: { barricade: 2 },
      offer: "Stone and wood. More wall. The herd has stood here a long time.",
      done: "Better. Let them come." },
    { ask: { stone: 20, iron: 6 }, give: { maxHp: 30 },
      offer: "Bring iron and I will show you how we take a hit and keep standing.",
      done: "You are heavier now. Not in body. Stand square." },
  ],
  wisp: [
    { ask: { berries: 4 }, give: { survey: 1 },
      offer: "Berries-berries-berries and I'll run the whole ridge and tell you where everything is, everything, all of it!",
      done: "Iron there, copper there, sulfur by the steam, GO GO GO!" },
    { ask: { berries: 8, fiber: 4 }, give: { items: { ammo: 24 } },
      offer: "I found a poacher cache! I'm too small to carry it! You feed me, I show you!",
      done: "Told you! Told you told you told you!" },
    { ask: { berries: 12, meds: 2 }, give: { survey: 2 },
      offer: "One more and I'll map the whole basin. The WHOLE basin. Every rock.",
      done: "Everything. Marked. You're welcome forever." },
  ],
  sable: [
    { ask: { ammo: 20, scrap: 6 }, give: { intel: 1 },
      offer: "I still know their rotation codes. Give me rounds and scrap and I'll tell you what's coming before it comes.",
      done: "You'll get a longer warning now. It's not much. It's what I have." },
    { ask: { scrap: 12, iron: 6 }, give: { turret: 1 },
      offer: "I can build one of their sentries backwards. It'll shoot at them for a change.",
      done: "It's ugly and it works. Like me." },
    { ask: { gunpowder: 6, iron: 8, copper: 4 }, give: { chip: true },
      offer: "There's a chip design they never fielded. I remember it. Bring me the parts.",
      done: "That one was mine, before. Now it's yours." },
  ],
  thermal: [
    { ask: { sulfur: 8, saltpeter: 6 }, give: { items: { gunpowder: 12 } },
      offer: "Sulfur AND saltpeter?! Do you know what the basin gives us for free? Bring it, bring it!",
      done: "Twelve charges of powder. The ground made that. Isn't that wonderful?" },
    { ask: { obsidian: 4, copper: 6, iron: 6 }, give: { weapon: 'geyser' },
      offer: "I want to build a hand geyser. It is a terrible idea. Help me.",
      done: "IT WORKS. Point it away from your face. Away. From. Your face." },
    { ask: { sulfur: 12, obsidian: 4 }, give: { geyserControl: 1 },
      offer: "One more and I can wake every cone in the basin on cue.",
      done: "The whole field answers now. Stand clear and let it sing." },
  ],
  ember: [
    { ask: { wood: 4, fiber: 4 }, give: { items: { meds: 2, ammo: 12 } },
      offer: "I'm not scared. I'm helping. Bring me wood and fibre and I'll make you a kit. A real one.",
      done: "See? I'm useful. I TOLD you I was useful." },
    { ask: { charcoal: 4, sulfur: 4 }, give: { smokeBombs: 1 },
      offer: "Charcoal and sulfur make smoke. Smoke makes them blind. I read that. Somewhere.",
      done: "Throw it and RUN. That's the whole plan. It's a good plan." },
    { ask: { wood: 8, scrap: 6 }, give: { maxHp: 15 },
      offer: "I'm making armour. For you. Out of the machines. Because they took you first.",
      done: "It fits. I measured you while you were asleep. Don't be weird about it." },
  ],
  quill: [
    { ask: { fiber: 8, berries: 6 }, give: { items: { meds: 5 } },
      offer: "Fibre for bandage, berries for the tincture. Precisely those amounts. Do not improvise.",
      done: "Five doses, correctly prepared. Note the correct dosage. Note it." },
    { ask: { water: 2, fiber: 6, meds: 2 }, give: { revive: 1 },
      offer: "If you insist on dying out there, I would like to be able to do something about it.",
      done: "You now have exactly one second chance. Exactly one. Do not spend it foolishly." },
    { ask: { berries: 12, fiber: 12 }, give: { maxHp: 25 },
      offer: "A full course of treatment. It will take everything you can carry.",
      done: "Your resting condition is markedly improved. I am pleased. Slightly." },
  ],
  bramble: [
    { ask: { stone: 12, iron: 4 }, give: { items: { iron: 10, copper: 6 } },
      offer: "Give me tools. I dig. You get ore. Simple.",
      done: "Dug. Ore. Take it." },
    { ask: { wood: 8, stone: 10 }, give: { items: { stone: 20, coal: 8 } },
      offer: "Shore up the shaft. Then I go deeper.",
      done: "Deeper. More rock. More coal." },
    { ask: { iron: 10, obsidian: 3 }, give: { chip: true },
      offer: "Found something down there. Machine part. Old. Bring iron and I'll cut it out.",
      done: "Was buried before you were born. It's yours." },
  ],
};

const BARKS = {
  gruff: ['Hmph.', 'Still standing.', 'Work to do.', "Don't touch that."],
  dry: ['Mm.', "Found another snare this morning. Third this week.",
    "You walk loud.", "There's a wire across the north draw. Was."],
  wry: ['Slow day. For you.', 'Message for you: run faster.', 'Still alive? Good, I had money on it.',
    "I've been to the ridge and back twice since you last blinked."],
  grim: ['Smoke on the north ridge.', 'I count nine of them.', 'It will burn again.',
    "I watched the last one. From up there. All of it."],
  patient: ['Two hundred and six.', 'That one will take forty years.', 'Plant more than you take.',
    'The river is low. It does that.'],
  small: ['HI!', "Are you the one from the lab? Are you?", 'I can help! I can!',
    "Mum says I'm not allowed near the fire.", 'Watch this! WATCH THIS!'],
  sunny: ['Look at the lupine!', 'Good morning!', 'The basin smells like rain.', 'Careful of the mats!'],
  sardonic: ['Delightful.', 'Another beautiful day in the extraction zone.', 'You look busy.', 'Mm.'],
  stoic: ['...', 'The valley remembers.', 'We stand.', 'Hm.'],
  frantic: ['HI HI HI!', 'Did you see it? Did you?!', 'Fast fast fast!', 'Whatwhatwhat!'],
  haunted: ["I hear them at night.", "It's quiet. That's worse.", "I'm still here.", "Keep moving."],
  excitable: ['The ground is BREATHING!', 'Ooh, a new vent!', 'Sixty-one degrees! Lovely!', 'Listen to that!'],
  brave: ["I'm not scared.", "Let me come with you!", "I can help!", "Did you see me?"],
  fussy: ['Wash that.', 'Hold still.', 'That is going to scar.', 'Hmm. Hmm.'],
  blunt: ['Dig.', 'Rock.', 'Good.', 'Move.'],
};

const WAITING = {
  gruff: "Well? I don't have it yet.",
  dry: "It's not here. I checked.",
  wry: "I could have run there and back nine times by now, but no pressure.",
  grim: "The clock is running. It always is.",
  patient: "When you have it. Not before.",
  small: "Did you get it? DID YOU? Sorry. Sorry.",
  sunny: "No rush! But also, some rush!",
  sardonic: "I'll just be here. Existing.",
  stoic: "I will wait. I am good at that.",
  frantic: "Did you get it did you get it DID YOU—",
  haunted: "Take your time. They won't.",
  excitable: "Ooh, are those for me? No? Ah.",
  brave: "I'll be right here! Guarding!",
  fussy: "The exact amounts, please.",
  blunt: "Not enough.",
};

const RECRUIT_LINE = {
  tamarack: "Six years I have been cutting their wire alone. I would rather not make it seven. I am with you.",
  pitch: "You want someone who can be four places at once? That is the entire job description. Let's go.",
  slate: "I know where every seam in this basin is, and I know where every one of their drills is going to hit. Point me at it.",
  cinder: "I have watched this valley burn once. I will not watch it twice from a branch. Put me in it.",
  willow: "Two hundred and six trees. I planted every one. I am not letting them have a single one of them.",
  rill: "Mum said no. Mum is not here. I'm coming and you can't stop me and I'll be REALLY useful.",
  brindle: "You've done more for this basin than I have in ten years. Point me at them. I'll bring the long gun.",
  juniper: "I can't stitch you back together fast enough from over here. I'm coming with you.",
  cobalt: "Fine. FINE. I'm coming. Someone has to talk to their machines.",
  mossback: "The herd moves when the herd must. I will walk with you now.",
  wisp: "REALLY?! I can come?! I'll scout! I'll be SO fast! You won't even see me!",
  sable: "I helped build what's coming. Let me help take it apart.",
  thermal: "If I'm going to die out here I'd rather it be near a really interesting vent. Lead on.",
  ember: "YES. Yes yes yes. I'm ready. I've BEEN ready.",
  quill: "Against my professional judgement, and entirely because of you, I am coming.",
  bramble: "You dig for others. I dig with you. That's it. That's the whole speech.",
};

// --- ability definitions for recruited soldiers ----------------------------
const ABILITIES = {
  slug:     { cd: 1.5, range: 210, fn: (n, g, t) => { g.spawnAllyBullet(n, t, 'slug', 28, 300); audio.play('rifle', { vol: 0.35 }); } },
  twinshot: { cd: 0.42, range: 170, fn: (n, g, t) => { g.spawnAllyBullet(n, t, 'pellet', 9, 260, 0.1); g.spawnAllyBullet(n, t, 'pellet', 9, 260, -0.1); audio.play('shoot', { vol: 0.28 }); } },
  quills:   { cd: 1.9, range: 150, fn: (n, g, t) => { for (let i = -2; i <= 2; i++) g.spawnAllyBullet(n, t, 'quill', 11, 230, i * 0.16); audio.play('shoot', { vol: 0.3 }); } },
  mark:     { cd: 2.6, range: 240, fn: (n, g, t) => { g.markEnemies(n.x, n.y, 150, 5); particles.ring(n.x, n.y - 6, 6, 150, 0.5, P.cyber, 1, true); audio.play('scan', { vol: 0.4 }); } },
  heal:     { cd: 5.5, range: 999, fn: (n, g) => { g.player.heal(16); g.healAllies(22); particles.ring(n.x, n.y - 6, 4, 70, 0.6, P.uiGood, 2, true); audio.play('rescue', { vol: 0.5 }); } },
  hack:     { cd: 7.0, range: 200, fn: (n, g, t) => { if (t && t.def.machine) { t.charmT = 7; particles.ring(t.x, t.y - 6, 4, 26, 0.4, P.cyber, 2, true); particles.text(t.x, t.y - 22, 'HIJACKED', P.cyber); audio.play('chip'); } } },
  charge:   { cd: 6.5, range: 170, fn: (n, g, t) => { n.chargeAt(t); } },
  smoke:    { cd: 6.0, range: 190, fn: (n, g, t) => { g.smokeBomb(t.x, t.y, 60); audio.play('explode', { vol: 0.4 }); } },
  geyser:   { cd: 8.0, range: 260, fn: (n, g, t) => { g.steamBurst(t.x, t.y); } },
  burrow:   { cd: 7.5, range: 150, fn: (n, g, t) => { n.burrowTo(t, g); } },
};

let npcId = 1;

export class NPC {
  constructor(key, x, y) {
    this.key = key;
    this.data = NPCS[key];
    this.cfg = this.data.cfg;
    this.id = npcId++;
    this.x = x; this.y = y;
    this.hx = x; this.hy = y;
    this.vx = 0; this.vy = 0;
    this.facing = chance(0.5) ? 1 : -1;
    this.view = 'front';
    this.anim = 'idle';
    this.animT = rnd(1);
    this.state = 'idle';         // idle | offering | waiting | receiving | crafting | gifting | soldier
    this.stateT = 0;
    this.favor = 0;
    this.questIndex = 0;
    this.quest = null;
    this.delivered = null;
    this.recruited = false;
    this.offeredRecruit = false;
    this.talkT = 0;
    this.barkT = rnd(4, 14);
    this.bark = null;
    this.transferT = 0;
    this.hp = 120; this.maxHp = 120;
    this.hurtT = 0;
    this.downT = 0;              // recruits go down, not dead
    this.abilityCd = rnd(0.5, 2);
    this.dir = rnd(TAU);
    this.wanderT = rnd(1, 4);
    this.chargeT = 0;
    this.burrowT = 0;
    this.objType = 'npc';
    const s = critterSize(this.cfg);
    this.w = s.w; this.h = s.h;
    this.r = Math.max(5, this.cfg.bodyW * 0.8);
    this.requests = REQUESTS[key] || [];
    this.pendingReq = null;
    this.buildTarget = null;
  }

  get name() { return this.data.name; }
  get personality() { return this.data.personality; }
  get done() { return this.questIndex >= this.requests.length && !this.buildOffer; }

  /**
   * The structure this one is willing to raise next, if any. Building the camp
   * always comes before their personal requests: there is no point asking
   * Brindle for a scattergun when there is nowhere to build one.
   */
  buildOfferFor(game) {
    if (!game.camp || game.camp.building) return null;
    const keys = game.camp.offersFor(this.key);
    return keys.length ? keys[0] : null;
  }

  /** The request object for a structure, shaped like any other request. */
  buildRequest(key) {
    const d = STRUCTURES[key];
    return {
      ask: d.cost, give: { build: key }, offer: d.offer, done: d.done,
      structure: key, name: d.name,
    };
  }

  /**
   * What this one's face is doing. Read off their situation, so an NPC who is
   * down looks down and one who is halfway through building your workbench
   * looks like they are concentrating.
   */
  get expression() {
    if (this.downT > 0) return 'hurt';
    if (this.hurtT > 0.05) return 'hurt';
    if (this.hp < this.maxHp * 0.35) return 'hurt';
    if (this.talkT > 0) return 'talk';
    if (this.anim === 'attack' || this.chargeT > 0) return 'angry';
    if (this.state === 'crafting' || this.state === 'building') return 'focused';
    if (this.state === 'gifting') return 'happy';
    if (this.state === 'offering' || this.state === 'waiting') return 'curious';
    if (this.recruited) return 'focused';
    if (this.favor >= 3) return 'happy';
    return 'calm';
  }

  get sprite() {
    const fr = critterFrames('npc:' + this.key, this.cfg, this.anim, this.view, 8, this.expression);
    return fr[Math.floor(this.animT * fr.length) % fr.length];
  }

  // ---------------------------------------------------------------- dialogue
  currentPrompt(game) {
    if (this.downT > 0) return 'REVIVE ' + this.name.toUpperCase();
    if (this.state === 'waiting') {
      const need = this.remaining();
      if (!need) return 'HAND OVER MATERIALS';
      return 'TALK TO ' + this.name.toUpperCase();
    }
    if (this.state === 'crafting') return null;
    if (this.state === 'building') return null;
    if (this.recruited) return 'TALK TO ' + this.name.toUpperCase();
    return 'TALK TO ' + this.name.toUpperCase();
  }

  /**
   * Say something about what just happened. Falls back silently if this
   * personality has no line for the event, so adding an event is cheap.
   */
  react(kind, game, chanceToSpeak = 1) {
    if (this.downT > 0 || this.state === 'building') return false;
    const table = REACT[kind];
    if (!table) return false;
    const line = table[this.personality];
    if (!line || !chance(chanceToSpeak)) return false;
    game.dialogue.showFloating(this, line);
    this.talkT = Math.max(this.talkT, 2.2);
    this.barkT = rnd(8, 20);
    return true;
  }

  /** The camp changed. They notice. */
  onCampChanged(game, key) {
    this.react('built', game, 0.5);
  }

  /** What the player still owes on the active request. */
  remaining() {
    if (!this.quest) return null;
    const out = {};
    let any = false;
    for (const k in this.quest.ask) {
      const left = this.quest.ask[k] - (this.delivered[k] || 0);
      if (left > 0) { out[k] = left; any = true; }
    }
    return any ? out : null;
  }

  interact(game) {
    const p = game.player;
    if (this.downT > 0) {
      this.downT = 0;
      this.hp = this.maxHp * 0.5;
      audio.play('rescue');
      particles.ring(this.x, this.y - 6, 4, 30, 0.5, P.uiGood, 2, true);
      game.dialogue.show(this, pick(['Back up. Back up.', "I'm fine. I'm fine!", 'Thank you.']), 2.2);
      return;
    }

    // recruitment offer takes priority once they trust you
    if (!this.recruited && this.favor >= RECRUIT_FAVOR) {
      this.recruited = true;
      this.state = 'soldier';
      audio.play('recruit');
      game.dialogue.show(this, RECRUIT_LINE[this.key] || 'I am with you.', 5);
      game.onRecruit(this);
      return;
    }

    if (this.state === 'waiting') {
      const need = this.remaining();
      if (need) {
        game.dialogue.show(this, WAITING[this.personality] + ' ' + this.needString(need), 3.4);
      } else {
        game.dialogue.show(this, 'Stand still. This will take a moment.', 2.4);
      }
      return;
    }

    if (this.state === 'crafting' || this.state === 'gifting') {
      game.dialogue.show(this, 'Working.', 1.4);
      return;
    }

    if (this.done) {
      game.dialogue.show(this, this.recruited
        ? pick(['Right behind you.', 'Say the word.', 'Ready.'])
        : pick(BARKS[this.personality]), 2.4);
      return;
    }

    // Offer the next thing. A camp structure outranks anything personal.
    const bkey = this.buildOfferFor(game);
    const req = bkey ? this.buildRequest(bkey) : this.requests[this.questIndex];
    if (!req) {
      game.dialogue.show(this, pick(BARKS[this.personality]), 2.4);
      return;
    }
    this.pendingReq = req;
    if (this.state !== 'offering') {
      this.state = 'offering';
      this.stateT = 12;
      game.dialogue.show(this, req.offer, 6, { accept: true, npc: this });
      audio.play('quest', { vol: 0.6 });
    } else {
      this.acceptQuest(game);
    }
  }

  acceptQuest(game) {
    const req = this.pendingReq || this.requests[this.questIndex];
    this.quest = req;
    this.delivered = {};
    this.state = 'waiting';
    game.dialogue.show(this, 'Bring me: ' + this.needString(req.ask), 4);
    game.onQuestAccepted(this, req);
    audio.play('uiselect');
  }

  needString(obj) {
    return Object.keys(obj).map(k => `${obj[k]} ${(RESOURCES[k] ? RESOURCES[k].name : k).toUpperCase()}`).join(', ');
  }

  // -------------------------------------------------------------- the handover
  /**
   * The core mechanic: standing close with the right materials physically
   * transfers them, one piece at a time, as arcing items.
   */
  updateHandover(dt, game) {
    if (this.state !== 'waiting' || !this.quest) return;
    const p = game.player;
    const d2 = dist2(this.x, this.y, p.x, p.y);
    if (d2 > 34 * 34) { this.transferT = 0; return; }

    const need = this.remaining();
    if (!need) return;

    // only transfer what the player is actually carrying
    let target = null;
    for (const k in need) {
      if (p.inv.get(k) > 0) { target = k; break; }
    }
    if (!target) return;

    this.transferT -= dt;
    if (this.transferT > 0) return;
    this.transferT = 0.22;

    p.inv.take(target, 1);
    this.delivered[target] = (this.delivered[target] || 0) + 1;
    game.flyItem(target, p.x, p.y - 10, this.x, this.y - 10, 0.38);
    audio.play('deliver', { vol: 0.5 });

    if (!this.remaining()) this.startCrafting(game);
  }

  startCrafting(game) {
    this.state = 'crafting';
    this.stateT = this.quest.give.weapon ? 2.6 : 1.7;
    this.anim = 'attack';
    audio.play('craft');
    game.dialogue.show(this, pick(['Right. Stand back.', 'Working.', "Give me a moment."]), 2);
  }

  finishCrafting(game) {
    const give = this.quest.give;
    const p = game.player;
    this.favor++;
    game.onQuestComplete(this, this.quest);

    if (give.weapon) {
      game.pickups.drop('weapon', give.weapon, this.x + this.facing * 14, this.y - 4, { vz: 130 });
    }
    if (give.items) {
      for (const k in give.items) {
        const n = give.items[k];
        for (let i = 0; i < Math.min(n, 10); i++) {
          game.pickups.drop('resource', k, this.x + rnd(-8, 8), this.y + rnd(-4, 4), { count: Math.ceil(n / Math.min(n, 10)), vz: rnd(80, 140) });
        }
      }
    }
    if (give.chip) {
      game.pickups.drop('chip', randomChipKey(Math.random, 1), this.x + this.facing * 12, this.y - 4, { vz: 140 });
    }
    if (give.chipSlot) { p.chipSlots += give.chipSlot; p.recompute(); game.toast('CHIP SOCKET INSTALLED (' + p.chipSlots + ')', P.cyber, 3); }
    if (give.maxHp) { p.maxHp += give.maxHp; p.hp += give.maxHp; game.toast('MAX HEALTH +' + give.maxHp, P.uiGood, 3); }
    if (give.barricade) game.buildBarricades(give.barricade);
    if (give.survey) game.surveyBasin(give.survey);
    if (give.intel) game.intelLevel = Math.max(game.intelLevel, give.intel);
    if (give.turret) game.buildAllyTurret(this.x + 24, this.y + 12);
    if (give.revive) { game.revives += give.revive; game.toast('SECOND CHANCE BANKED', P.uiGood, 3); }
    if (give.smokeBombs) { game.smokeBombCharges += 3; game.toast('SMOKE BOMBS +3  [G TO THROW]', P.uiGood, 3.4); }
    if (give.geyserControl) { game.geyserControl = true; game.toast('GEYSER CONTROL ONLINE', P.springHot, 3.4); }
    // give.build is handled below, once they have actually built the thing

    const wasBuild = this.quest.structure;

    game.dialogue.show(this, this.quest.done, 4.5);
    audio.play('waveclear', { vol: 0.5 });
    particles.ring(this.x, this.y - 6, 4, 40, 0.6, P.favor, 2, true);
    particles.text(this.x, this.y - 26, 'FAVOUR +1', P.favor, { life: 1.6 });

    this.quest = null;
    this.delivered = null;
    // A camp structure is not one of their personal requests, so it does not
    // consume one: they go off and build it and their own list is untouched.
    if (wasBuild) {
      this.pendingReq = null;
      game.camp.beginBuild(wasBuild, this, game);
      return;
    }
    this.questIndex++;
    this.state = 'idle';

    if (this.favor >= RECRUIT_FAVOR && !this.recruited && !this.offeredRecruit) {
      this.offeredRecruit = true;
      game.toast(this.name.toUpperCase() + ' WILL FIGHT WITH YOU - GO TALK TO THEM', P.favor, 5);
    }
  }

  // ---------------------------------------------------------------- update
  update(dt, game) {
    this.hurtT = Math.max(0, this.hurtT - dt);
    // While they are raising something the camp system owns them completely.
    if (this.state === 'building') {
      this.anim = 'work';
      this.animT = (this.animT + dt * 2.4) % 1;
      this.talkT = Math.max(0, this.talkT - dt);
      return;
    }
    this.talkT = Math.max(0, this.talkT - dt);

    if (this.downT > 0) {
      this.downT -= dt;
      this.anim = 'dead';
      this.animT = 0;
      if (this.downT <= 0) { this.hp = this.maxHp * 0.4; }
      return;
    }

    if (this.state === 'offering') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'idle';
    }
    if (this.state === 'crafting') {
      this.stateT -= dt;
      this.anim = 'attack';
      this.animT = (this.animT + dt * 2.4) % 1;
      if (chance(dt * 22)) particles.sparks(this.x + rnd(-6, 6), this.y - 8, 2, P.fire2);
      if (this.stateT <= 0) this.finishCrafting(game);
      return;
    }

    this.updateHandover(dt, game);

    if (this.recruited) this.updateSoldier(dt, game);
    else this.updateIdle(dt, game);

    // ambient personality barks
    this.barkT -= dt;
    if (this.barkT <= 0) {
      this.barkT = rnd(9, 26);
      if (dist2(this.x, this.y, game.player.x, game.player.y) < 130 * 130 && chance(0.55)) {
        game.dialogue.showFloating(this, pick(BARKS[this.personality]));
      }
    }
  }

  updateIdle(dt, game) {
    const p = game.player;
    const d2 = dist2(this.x, this.y, p.x, p.y);
    this.wanderT -= dt;

    if (d2 < 46 * 46) {
      // turn to face the player when they're close: small, but it sells them
      this.vx *= Math.exp(-8 * dt);
      this.vy *= Math.exp(-8 * dt);
      this.facing = p.x > this.x ? 1 : -1;
      this.anim = this.state === 'waiting' ? 'idle' : 'idle';
    } else {
      if (this.wanderT <= 0) {
        this.wanderT = rnd(2.2, 6);
        this.dir = rnd(TAU);
        this.wandering = chance(0.55);
      }
      if (this.wandering) {
        const home = Math.atan2(this.hy - this.y, this.hx - this.x);
        const dh = Math.sqrt(dist2(this.x, this.y, this.hx, this.hy));
        if (dh > 60) this.dir += clamp(angleDiff(this.dir, home), -dt * 3, dt * 3);
        const sp = 22;
        this.vx = Math.cos(this.dir) * sp;
        this.vy = Math.sin(this.dir) * sp;
      } else {
        this.vx *= Math.exp(-6 * dt);
        this.vy *= Math.exp(-6 * dt);
      }
    }
    this._integrate(dt, game);
    const sp = Math.hypot(this.vx, this.vy);
    this.anim = this.state === 'crafting' ? 'attack' : sp > 12 ? 'walk' : 'idle';
    this.animT = (this.animT + dt * (sp > 12 ? 1.1 : 0.5)) % 1;
  }

  updateSoldier(dt, game) {
    const p = game.player;
    this.abilityCd -= dt;
    if (this.chargeT > 0) {
      this.chargeT -= dt;
      this._integrate(dt, game);
      game.damageEnemiesAt(this.x, this.y, 20, 26 * dt * 4, this);
      if (chance(dt * 30)) particles.dust(this.x, this.y, 2, P.dirtLight);
      this.anim = 'run';
      this.animT = (this.animT + dt * 2.2) % 1;
      return;
    }
    if (this.burrowT > 0) {
      this.burrowT -= dt;
      if (this.burrowT <= 0) {
        game.damageEnemiesAt(this.x, this.y, 44, 40, this);
        particles.ring(this.x, this.y, 4, 50, 0.4, P.dirtLight, 2, false);
        particles.burst(this.x, this.y, 20, { colors: [P.dirt, P.dirtLight, P.stone], speed: 130, life: 0.6, vz: 120 });
        game.r.camera.addShake(3);
        audio.play('explode', { vol: 0.5 });
      }
      return;
    }

    const enemy = game.nearestEnemy(this.x, this.y, 260);
    const ab = ABILITIES[this.data.ability];

    // stay in a loose formation behind the player, break to engage
    let tx, ty, keep;
    if (enemy) {
      tx = enemy.x; ty = enemy.y; keep = Math.min(ab.range * 0.7, 120);
    } else {
      const a = (this.id * 1.7) % TAU;
      tx = p.x + Math.cos(a) * 26; ty = p.y + Math.sin(a) * 20; keep = 0;
    }
    const d = Math.sqrt(dist2(this.x, this.y, tx, ty));
    const speed = enemy ? 74 : (d > 90 ? 118 : 62);
    if (d > (keep || 16)) {
      const ang = Math.atan2(ty - this.y, tx - this.x);
      this.vx += (Math.cos(ang) * speed - this.vx) * clamp(dt * 6, 0, 1);
      this.vy += (Math.sin(ang) * speed - this.vy) * clamp(dt * 6, 0, 1);
    } else {
      this.vx *= Math.exp(-6 * dt);
      this.vy *= Math.exp(-6 * dt);
    }
    this._integrate(dt, game);

    if (enemy && this.abilityCd <= 0 && d < ab.range) {
      this.abilityCd = ab.cd;
      ab.fn(this, game, enemy);
      this.facing = enemy.x > this.x ? 1 : -1;
      particles.text(this.x, this.y - this.h - 2, this.data.abilityName.toUpperCase(), P.favor, { life: 0.9, scale: 1 });
    } else if (!enemy && this.abilityCd <= 0 && this.data.ability === 'heal' && p.hp < p.maxHp * 0.7) {
      this.abilityCd = ABILITIES.heal.cd;
      ABILITIES.heal.fn(this, game, null);
    }

    const sp = Math.hypot(this.vx, this.vy);
    this.anim = sp > 70 ? 'run' : sp > 10 ? 'walk' : 'idle';
    this.animT = (this.animT + dt * (sp > 70 ? 1.8 : sp > 10 ? 1.1 : 0.5)) % 1;
    if (Math.abs(this.vx) > 6) this.facing = this.vx > 0 ? 1 : -1;
    this.view = this.vy < -12 ? 'back' : 'front';

    if (game.fire.burnAtPx(this.x, this.y) > 0) this.damage(dt * 8, game);
  }

  chargeAt(target) {
    if (!target) return;
    const a = Math.atan2(target.y - this.y, target.x - this.x);
    this.vx = Math.cos(a) * 300;
    this.vy = Math.sin(a) * 300;
    this.chargeT = 0.85;
    audio.play('roar', { vol: 0.45 });
  }

  burrowTo(target, game) {
    if (!target) return;
    particles.burst(this.x, this.y, 14, { colors: [P.dirt, P.dirtLight], speed: 90, life: 0.5, vz: 80 });
    this.x = target.x + rnd(-10, 10);
    this.y = target.y + rnd(-10, 10);
    this.burrowT = 0.35;
    audio.play('dash', { vol: 0.5 });
  }

  _integrate(dt, game) {
    const world = game.world;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (!isSolid(world.tileAtPx(nx, this.y)) && !TILES[world.tileAtPx(nx, this.y)].deep) this.x = clamp(nx, 8, world.pxW - 8);
    else this.vx *= -0.3;
    if (!isSolid(world.tileAtPx(this.x, ny)) && !TILES[world.tileAtPx(this.x, ny)].deep) this.y = clamp(ny, 8, world.pxH - 8);
    else this.vy *= -0.3;
  }

  damage(n, game) {
    if (this.downT > 0) return;
    this.hp -= n;
    this.hurtT = 0.2;
    if (this.hp <= 0) {
      this.hp = 0;
      this.downT = 14;
      audio.play('hurt', { vol: 0.6 });
      particles.blood(this.x, this.y - 6, 12);
      game.toast(this.name.toUpperCase() + ' IS DOWN - REVIVE THEM', P.uiBad, 3.4);
    }
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  // ---------------------------------------------------------------- drawing
  draw(r, game) {
    const img = this.sprite;
    if (!img) return;
    r.shadow(this.x, this.y, this.r + 1, (this.r + 1) * 0.4);
    let out = img;
    if (this.hurtT > 0 && Math.floor(this.hurtT * 26) % 2 === 0) {
      const fr = critterFrames('npc:' + this.key, this.cfg, this.anim, this.view, 8, this.expression);
      out = flashFrames('npc:' + this.key + this.anim + this.view, fr, '#ffffff')[Math.floor(this.animT * fr.length) % fr.length];
    }
    const down = this.downT > 0;
    if (down) {
      r.drawT(out, this.x, this.y - out.height * 0.3, 1.5, this.facing < 0 ? -1 : 1, 1, 0.85);
    } else {
      r.draw(out, this.x - out.width / 2, this.y - out.height + 2, this.facing < 0);
    }

    const headY = this.y - out.height - 4;

    if (down) {
      const pulse = 0.5 + Math.sin(game.time * 6) * 0.4;
      r.ring(this.x, this.y - 4, 12, P.uiBad, 1, pulse);
      return;
    }

    // status markers above the head
    if (this.state === 'waiting' && this.quest) {
      const need = this.remaining();
      if (need) {
        // show the next thing they still need as a floating icon + count
        const k = Object.keys(need)[0];
        const icon = itemIcon(k);
        const bob = Math.sin(game.time * 3 + this.id) * 1.2;
        r.rectA(this.x - 12, headY - 12 + bob, 24, 13, 'rgba(9,16,13,0.75)', 0.9);
        r.draw(icon, this.x - 11, headY - 11 + bob);
        game.drawWorldText(String(need[k]), this.x + 8, headY - 8 + bob, P.ui, 'center');
      } else {
        const bob = Math.sin(game.time * 5) * 1.6;
        r.circle(this.x, headY - 6 + bob, 3, P.uiGood, 0.9);
      }
    } else if (this.state === 'offering') {
      const bob = Math.sin(game.time * 7) * 1.6;
      game.drawWorldText('!', this.x, headY - 12 + bob, P.favor, 'center', 2);
    } else if (!this.done && !this.recruited) {
      const bob = Math.sin(game.time * 2.4 + this.id) * 1;
      game.drawWorldText('?', this.x, headY - 10 + bob, P.favor, 'center', 1);
    }
    if (this.recruited) {
      // a small chevron marks your soldiers in a crowded fight
      r.rect(this.x - 2, headY - 4, 4, 1, P.uiAccent);
      r.rect(this.x - 1, headY - 3, 2, 1, P.uiAccent);
      if (this.hp < this.maxHp) {
        const w = 14, frac = clamp(this.hp / this.maxHp, 0, 1);
        r.rect(this.x - w / 2, headY - 1, w, 2, 'rgba(0,0,0,0.6)');
        r.rect(this.x - w / 2, headY - 1, w * frac, 2, P.uiGood);
      }
    }
  }
}

/** Place the full cast around the den using the world's chosen camp spots. */
export function spawnNPCs(world, seed) {
  const rng = makeRng(seed ^ 0xa11ce);
  const list = [];
  const spots = world.npcSpots.slice();
  rng.shuffle(spots);
  NPC_ORDER.forEach((key, i) => {
    const s = spots[i] || { x: world.den.x + rng.range(-90, 90), y: world.den.y + rng.range(-70, 70) };
    list.push(new NPC(key, s.x, s.y));
  });
  return list;
}
