// Entry point. Picks a seed (from ?seed= if you want to replay a basin),
// generates the world, then hands control to the game loop.

import { Game } from './game.js';
import { audio } from './engine/audio.js';

export async function boot() {
  const canvas = document.getElementById('screen');
  const bootEl = document.getElementById('boot');
  const msgEl = document.getElementById('bootmsg');
  const btn = document.getElementById('startbtn');

  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  const seed = seedParam ? (parseInt(seedParam, 36) || parseInt(seedParam, 10) || 1) : (Math.random() * 0xffffffff) >>> 0;

  msgEl.textContent = 'Generating the basin…';
  // Yield once so the browser paints the loading text before we block on
  // worldgen (a couple of hundred thousand noise samples).
  await new Promise(r => setTimeout(r, 30));

  const t0 = performance.now();
  const game = new Game(canvas, seed);
  const genMs = Math.round(performance.now() - t0);

  window.game = game;   // handy in the console
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F1') { game.showFps = !game.showFps; e.preventDefault(); }
  });

  msgEl.textContent = `Basin ${seed.toString(36)} generated in ${genMs}ms — ${game.world.nodes.length} resource nodes, ${game.wildlife.animals.length} animals, ${game.npcs.length} neighbours.`;
  btn.classList.remove('hidden');

  const begin = () => {
    audio.init();
    audio.resume();
    bootEl.remove();
    game.start();
  };
  btn.addEventListener('click', begin, { once: true });
  // Enter/space works too, for people who never touch the mouse.
  const keyStart = (e) => {
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
      window.removeEventListener('keydown', keyStart);
      begin();
    }
  };
  window.addEventListener('keydown', keyStart);

  return game;
}
