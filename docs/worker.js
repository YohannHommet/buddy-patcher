// ── Buddy Patcher — Bruteforce Web Worker ──────────────────
// Runs wyhash via WASM + Mulberry32 PRNG to find matching salts.

const SPECIES = ['duck','goose','blob','cat','dragon','octopus','owl','penguin','turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk'];
const RARITIES = ['common','uncommon','rare','epic','legendary'];
const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
const RARITY_FLOOR = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 };
const EYES = ['·','✦','×','◉','@','°'];
const HATS = ['none','crown','tophat','propeller','halo','wizard','beanie','tinyduck'];
const STAT_NAMES = ['DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK'];
const SALT_LEN = 15;
const SALT_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_';

// ── WASM wyhash ─────────────────────────────────────────────
let wasmExports = null;
const textEncoder = new TextEncoder();

async function initWasm(wasmBase64) {
  const bytes = Uint8Array.from(atob(wasmBase64), c => c.charCodeAt(0));
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: { print() {} }
  });
  wasmExports = instance.exports;
}

function wasmAlloc(size) {
  return wasmExports.alloc(size);
}

function hashString(s) {
  const encoded = textEncoder.encode(s);
  const size = encoded.length;
  const ptr = wasmAlloc(size);
  if (ptr === -1) throw new Error('WASM alloc failed');
  const mem = new Uint8Array(wasmExports.memory.buffer);
  mem.set(encoded, ptr);
  const hash64 = BigInt.asUintN(64, wasmExports.wyhash(ptr, size, 0n));
  return Number(hash64 & 0xffffffffn);
}

// ── PRNG: Mulberry32 ────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Roll logic ──────────────────────────────────────────────
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function rollRarity(rng) {
  let r = rng() * 100;
  for (const rarity of RARITIES) { r -= RARITY_WEIGHTS[rarity]; if (r < 0) return rarity; }
  return 'common';
}

function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity], peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);
  const stats = {};
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    else stats[name] = floor + Math.floor(rng() * 40);
  }
  return stats;
}

function roll(userId, salt) {
  const rng = mulberry32(hashString(userId + salt));
  const rarity = rollRarity(rng);
  return {
    rarity, species: pick(rng, SPECIES), eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01, stats: rollStats(rng, rarity),
  };
}

function randomSalt() {
  let s = '';
  for (let i = 0; i < SALT_LEN; i++) s += SALT_CHARS[Math.floor(Math.random() * SALT_CHARS.length)];
  return s;
}

// ── Worker message handler ──────────────────────────────────
self.onmessage = async (e) => {
  const { type, userId, wasmBase64, filter, maxRolls = 10_000_000 } = e.data;

  if (type === 'init') {
    await initWasm(wasmBase64);
    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'roll') {
    const salt = e.data.salt || 'friend-2026-401';
    const bones = roll(userId, salt);
    self.postMessage({ type: 'result', bones, salt });
    return;
  }

  if (type === 'hunt') {
    const results = [];
    const t0 = performance.now();
    const { wantRarity, wantSpecies, wantShiny } = filter;

    for (let i = 0; i < maxRolls; i++) {
      if (i % 100_000 === 0 && i > 0) {
        self.postMessage({ type: 'progress', attempts: i });
      }

      const salt = randomSalt();
      const bones = roll(userId, salt);

      const matchRarity = !wantRarity || bones.rarity === wantRarity;
      const matchSpecies = !wantSpecies || bones.species === wantSpecies;
      const matchShiny = !wantShiny || bones.shiny;

      if (matchRarity && matchSpecies && matchShiny) {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        results.push({ salt, bones, attempts: i + 1, elapsed });
        self.postMessage({ type: 'found', result: results[results.length - 1], total: results.length });
        if (results.length >= 5) break;
      }
    }

    self.postMessage({ type: 'done', results, attempts: maxRolls });
    return;
  }

  if (type === 'random') {
    const salt = randomSalt();
    const bones = roll(userId, salt);
    self.postMessage({ type: 'result', bones, salt });
  }
};
