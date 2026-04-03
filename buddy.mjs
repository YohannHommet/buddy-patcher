#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════════════════════
//  buddy-patcher — Your buddy, your rules.
//  Preview, bruteforce, and patch your Claude Code companion.
//
//  100% local — your UUID never leaves your machine.
//
//  Usage:
//    bun buddy-patcher.mjs                          Interactive menu
//    bun buddy-patcher.mjs --hunt legendary         Quick hunt
//    bun buddy-patcher.mjs --hunt epic:dragon+shiny Combined filter
//    bun buddy-patcher.mjs --apply "<salt>"         Patch binary directly
//    bun buddy-patcher.mjs --revert                 Restore original binary
//    bun buddy-patcher.mjs --help                   Show help
//
//  Algorithm source: github.com/zackautocracy/claude-code/tree/main/src/buddy
// ═══════════════════════════════════════════════════════════════════════════

const VERSION = '1.0.0'
const REPO_URL = 'https://github.com/YohannHommet/buddy-patcher'

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, accessSync, constants as FS } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import { createInterface } from 'node:readline'

// ── Require Bun ─────────────────────────────────────────────────────────
if (typeof Bun === 'undefined') {
  console.error('\x1b[31mThis script requires Bun. Run with: bun buddy.mjs\x1b[0m')
  process.exit(1)
}

// ── ANSI helpers ────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', italic: '\x1b[3m',
  gray: '\x1b[90m', green: '\x1b[32m', blue: '\x1b[34m', magenta: '\x1b[35m',
  yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', white: '\x1b[97m',
  eraseLine: '\x1b[2K',
}
const RC = { common: C.gray, uncommon: C.green, rare: C.blue, epic: C.magenta, legendary: C.yellow }

// ── Constants (exact match with Claude Code source) ─────────────────────
const SPECIES = ['duck','goose','blob','cat','dragon','octopus','owl','penguin','turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk']
const RARITIES = ['common','uncommon','rare','epic','legendary']
const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 }
const RARITY_STARS = { common: '★', uncommon: '★★', rare: '★★★', epic: '★★★★', legendary: '★★★★★' }
const RARITY_FLOOR = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 }
const EYES = ['·','✦','×','◉','@','°']
const HATS = ['none','crown','tophat','propeller','halo','wizard','beanie','tinyduck']
const STAT_NAMES = ['DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK']
const ORIGINAL_SALT = 'friend-2026-401'
const SALT_LEN = ORIGINAL_SALT.length // 15
const SALT_REGEX = /^[a-zA-Z0-9\-_]{15}$/

// ── PRNG: Mulberry32 ───────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// ── Hash: Bun.hash (wyhash) ────────────────────────────────────────────
function hashString(s) { return Number(BigInt(Bun.hash(s)) & 0xffffffffn) }

// ── Roll logic ─────────────────────────────────────────────────────────
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)] }

function rollRarity(rng) {
  let r = rng() * 100
  for (const rarity of RARITIES) { r -= RARITY_WEIGHTS[rarity]; if (r < 0) return rarity }
  return 'common'
}

function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity], peak = pick(rng, STAT_NAMES)
  let dump = pick(rng, STAT_NAMES)
  while (dump === peak) dump = pick(rng, STAT_NAMES)
  const stats = {}
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30))
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15))
    else stats[name] = floor + Math.floor(rng() * 40)
  }
  return stats
}

function roll(userId, salt = ORIGINAL_SALT) {
  const rng = mulberry32(hashString(userId + salt))
  const rarity = rollRarity(rng)
  return {
    rarity, species: pick(rng, SPECIES), eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01, stats: rollStats(rng, rarity),
  }
}

// ── Sprites (frame 0) ──────────────────────────────────────────────────
const BODIES = {
  duck:     ['    __      ','  <({E} )___  ','   (  ._>   ','    `--´    '],
  goose:    ['     ({E}>    ','     ||     ','   _(__)_   ','    ^^^^    '],
  blob:     ['   .----.   ','  ( {E}  {E} )  ','  (      )  ','   `----´   '],
  cat:      ['   /\\_/\\    ','  ( {E}   {E})  ','  (  ω  )   ','  (")_(")   '],
  dragon:   ['  /^\\  /^\\  ',' <  {E}  {E}  > ',' (   ~~   ) ','  `-vvvv-´  '],
  octopus:  ['   .----.   ','  ( {E}  {E} )  ','  (______)  ','  /\\/\\/\\/\\  '],
  owl:      ['   /\\  /\\   ','  (({E})({E}))  ','  (  ><  )  ','   `----´   '],
  penguin:  ['  .---.     ','  ({E}>{E})     ',' /(   )\\    ','  `---´     '],
  turtle:   ['   _,--._   ','  ( {E}  {E} )  ',' /[______]\\ ','  ``    ``  '],
  snail:    [' {E}    .--.  ','  \\  ( @ )  ','   \\_`--´   ','  ~~~~~~~   '],
  ghost:    ['   .----.   ','  / {E}  {E} \\  ','  |      |  ','  ~`~``~`~  '],
  axolotl:  ['}~(______)~{','}~({E} .. {E})~{','  ( .--. )  ','  (_/  \\_)  '],
  capybara: ['  n______n  ',' ( {E}    {E} ) ',' (   oo   ) ','  `------´  '],
  cactus:   [' n  ____  n ',' | |{E}  {E}| | ',' |_|    |_| ','   |    |   '],
  robot:    ['   .[||].   ','  [ {E}  {E} ]  ','  [ ==== ]  ','  `------´  '],
  rabbit:   ['   (\\__/)   ','  ( {E}  {E} )  ',' =(  ..  )= ','  (")__(")  '],
  mushroom: [' .-o-OO-o-. ','(__________)','   |{E}  {E}|   ','   |____|   '],
  chonk:    ['  /\\    /\\  ',' ( {E}    {E} ) ',' (   ..   ) ','  `------´  '],
}
const HAT_LINES = { none:'', crown:'   \\^^^/    ', tophat:'   [___]    ', propeller:'    -+-     ', halo:'   (   )    ', wizard:'    /^\\     ', beanie:'   (___)    ', tinyduck:'    ,>      ' }

function renderSprite(b) {
  const lines = BODIES[b.species].map(l => l.replaceAll('{E}', b.eye))
  if (b.hat !== 'none') lines.unshift(HAT_LINES[b.hat])
  return lines
}

// ── Display ────────────────────────────────────────────────────────────
function statBar(v) { const f = Math.round(v / 10); return '█'.repeat(f) + '░'.repeat(10 - f) }
function statColor(v) { return v >= 80 ? C.yellow : v >= 50 ? C.green : v >= 30 ? C.white : C.dim }

function displayCompanion(bones, label) {
  const rc = RC[bones.rarity]
  console.log(`${rc}${C.bold}${RARITY_STARS[bones.rarity]} ${bones.rarity.toUpperCase()}${C.reset}  ${C.bold}${bones.species.toUpperCase()}${C.reset}${bones.shiny ? ` ${C.yellow}✨ SHINY${C.reset}` : ''}`)
  console.log()
  for (const line of renderSprite(bones)) console.log(`  ${rc}${line}${C.reset}`)
  console.log()
  if (label) console.log(`  ${C.dim}${label}${C.reset}`)
  console.log(`  ${C.dim}eye: ${bones.eye}  hat: ${bones.hat}${C.reset}\n`)
  for (const name of STAT_NAMES) {
    const v = bones.stats[name], sc = statColor(v)
    console.log(`  ${name.padEnd(10)} ${sc}${statBar(v)}${C.reset}  ${sc}${v}${C.reset}`)
  }
  console.log()
}

// ── Auto-detection ─────────────────────────────────────────────────────
function detectUserId() {
  const configPath = join(homedir(), '.claude.json')
  if (!existsSync(configPath)) return null
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config.oauthAccount?.accountUuid ?? config.userID ?? null
  } catch { return null }
}

function resolveBinaryPath(symlink) {
  // realpath works on macOS + Linux; readlink -f is GNU-only
  for (const cmd of [`realpath "${symlink}"`, `readlink -f "${symlink}"`]) {
    try {
      const resolved = execSync(cmd + ' 2>/dev/null', { encoding: 'utf-8' }).trim()
      if (resolved) return resolved
    } catch { /* try next */ }
  }
  return symlink
}

function detectBinary() {
  try {
    const which = execSync('which claude 2>/dev/null', { encoding: 'utf-8' }).trim()
    if (!which) return null
    return resolveBinaryPath(which)
  } catch { return null }
}

function checkWritePermission(filePath) {
  try {
    accessSync(filePath, FS.W_OK)
    return true
  } catch { return false }
}

// ── Bruteforce ─────────────────────────────────────────────────────────
function randomSalt() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_'
  let s = ''
  for (let i = 0; i < SALT_LEN; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function bruteforce(userId, filter, maxRolls = 20_000_000) {
  const results = []
  const t0 = performance.now()
  for (let i = 0; i < maxRolls; i++) {
    if (i % 500_000 === 0 && i > 0) {
      process.stdout.write(`\r  ${C.dim}${(i / 1_000_000).toFixed(1)}M attempts...${C.reset}`)
    }
    const salt = randomSalt()
    const bones = roll(userId, salt)
    if (filter(bones)) {
      results.push({ salt, bones, attempts: i + 1, elapsed: ((performance.now() - t0) / 1000).toFixed(1) })
      if (results.length >= 5) break
    }
  }
  if (results.length > 0) process.stdout.write('\r' + C.eraseLine)
  return results
}

// ── Patching ───────────────────────────────────────────────────────────
function findBackup(binaryPath) {
  // Support both legacy (.backup) and current (.buddy-backup) naming
  for (const suffix of ['.buddy-backup', '.backup']) {
    const p = binaryPath + suffix
    if (existsSync(p)) return p
  }
  return binaryPath + '.buddy-backup' // default for new backups
}

function validateSalt(salt) {
  if (salt.length !== SALT_LEN) return `Salt must be exactly ${SALT_LEN} characters (got ${salt.length}).`
  if (!SALT_REGEX.test(salt)) return 'Salt must contain only lowercase letters, digits, hyphens, and underscores.'
  return null
}

function writeBinary(filePath, buf) {
  // Unlink first to avoid ETXTBSY when the binary is running
  try { unlinkSync(filePath) } catch {}
  writeFileSync(filePath, buf, { mode: 0o755 })
}

function patchBinary(binaryPath, newSalt) {
  const err = validateSalt(newSalt)
  if (err) throw new Error(err)

  const backupPath = findBackup(binaryPath)
  let buf = readFileSync(binaryPath)

  // Check for original salt
  if (buf.indexOf(ORIGINAL_SALT) === -1) {
    // Already patched — restore from backup first
    if (existsSync(backupPath)) {
      console.log(`  ${C.dim}Binary already patched. Restoring from backup first...${C.reset}`)
      buf = readFileSync(backupPath)
      if (buf.indexOf(ORIGINAL_SALT) === -1) {
        throw new Error('Backup is also corrupted. Cannot patch.')
      }
    } else {
      throw new Error('Original salt not found in binary and no backup exists.')
    }
  }

  // Create backup from the clean (unpatched) buffer
  if (!existsSync(backupPath)) {
    writeFileSync(backupPath, buf)
    console.log(`  ${C.green}✓ Backup saved${C.reset} ${C.dim}${backupPath}${C.reset}`)
  }

  // Replace all occurrences of the salt
  const oldBuf = Buffer.from(ORIGINAL_SALT)
  const newBuf = Buffer.from(newSalt)
  let idx = 0, count = 0
  while ((idx = buf.indexOf(oldBuf, idx)) !== -1) {
    newBuf.copy(buf, idx)
    idx += SALT_LEN
    count++
  }

  writeBinary(binaryPath, buf)
  console.log(`  ${C.green}${C.bold}✓ Patched ${count} occurrence(s)${C.reset}: "${ORIGINAL_SALT}" → "${newSalt}"`)
}

function revertBinary(binaryPath) {
  const backupPath = findBackup(binaryPath)
  if (!existsSync(backupPath)) throw new Error('No backup found. Nothing to revert.')
  const buf = readFileSync(backupPath)
  writeBinary(binaryPath, buf)
  unlinkSync(backupPath)
  console.log(`  ${C.green}${C.bold}✓ Reverted to original binary.${C.reset}`)
}

// ── Interactive readline ───────────────────────────────────────────────
function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()) }))
}

// ── Parse filter string ────────────────────────────────────────────────
function parseFilter(str) {
  const s = str.toLowerCase()
  const wantShiny = s.includes('+shiny')
  const clean = s.replace('+shiny', '')
  let wantRarity = null, wantSpecies = null
  if (clean.includes(':')) {
    const [r, sp] = clean.split(':')
    wantRarity = RARITIES.includes(r) ? r : null
    wantSpecies = SPECIES.includes(sp) ? sp : null
  } else {
    wantRarity = RARITIES.includes(clean) ? clean : null
    wantSpecies = SPECIES.includes(clean) ? clean : null
  }
  if (!wantRarity && !wantSpecies && !wantShiny) return null
  return (bones) => {
    if (wantRarity && bones.rarity !== wantRarity) return false
    if (wantSpecies && bones.species !== wantSpecies) return false
    if (wantShiny && !bones.shiny) return false
    return true
  }
}

// ── Help ───────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
${C.bold}  🎲 Buddy Patcher v${VERSION}${C.reset}
${C.dim}  Your buddy, your rules.${C.reset}

${C.bold}  Usage:${C.reset}
    bun buddy.mjs ${C.cyan}[no args]${C.reset}                  Interactive menu
    bun buddy.mjs ${C.cyan}--hunt${C.reset} <filter>            Find matching companions
    bun buddy.mjs ${C.cyan}--apply${C.reset} "<salt>"           Patch binary with a salt
    bun buddy.mjs ${C.cyan}--revert${C.reset}                   Restore original binary
    bun buddy.mjs ${C.cyan}--help${C.reset}                     Show this help
    bun buddy.mjs ${C.cyan}--version${C.reset}                  Show version

${C.bold}  Filters:${C.reset}
    ${C.dim}legendary                     Rarity only${C.reset}
    ${C.dim}dragon                        Species only${C.reset}
    ${C.dim}epic:cat                      Rarity + species${C.reset}
    ${C.dim}legendary+shiny               Rarity + shiny${C.reset}
    ${C.dim}legendary:dragon+shiny        The holy grail${C.reset}

${C.bold}  Rarities:${C.reset} ${RARITIES.join(', ')}
${C.bold}  Species:${C.reset}  ${SPECIES.join(', ')}

${C.dim}  ${REPO_URL}${C.reset}
`)
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)

  // Quick flags that don't need auto-detection
  if (args[0] === '--help' || args[0] === '-h') { showHelp(); return }
  if (args[0] === '--version' || args[0] === '-v') { console.log(`buddy-patcher v${VERSION}`); return }

  // Header
  console.log(`\n${C.bold}  🎲 Buddy Patcher${C.reset} ${C.dim}v${VERSION}${C.reset}`)
  console.log(`${C.dim}  Your buddy, your rules.${C.reset}\n`)

  // Auto-detect
  const userId = detectUserId()
  const binaryPath = detectBinary()

  if (!userId) {
    console.log(`  ${C.red}✗ Could not find accountUuid in ~/.claude.json${C.reset}`)
    console.log(`  ${C.dim}Make sure you're logged into Claude Code.${C.reset}\n`)
    process.exit(1)
  }
  if (!binaryPath) {
    console.log(`  ${C.red}✗ Could not find Claude binary${C.reset}`)
    console.log(`  ${C.dim}Make sure Claude Code is installed and 'claude' is in your PATH.${C.reset}\n`)
    process.exit(1)
  }

  console.log(`  ${C.dim}userId: ${userId}${C.reset}`)
  console.log(`  ${C.dim}binary: ${binaryPath}${C.reset}\n`)

  // Permission check for write operations
  const needsWrite = ['--revert', '--apply'].includes(args[0])
  if (needsWrite && !checkWritePermission(binaryPath)) {
    console.log(`  ${C.red}✗ No write permission on binary.${C.reset}`)
    console.log(`  ${C.dim}Try: sudo bun buddy.mjs ${args.join(' ')}${C.reset}\n`)
    process.exit(1)
  }

  // ── Quick --revert ──
  if (args[0] === '--revert') {
    revertBinary(binaryPath)
    console.log(`  ${C.dim}Restart Claude Code to get your original companion back.${C.reset}\n`)
    return
  }

  // ── Quick --apply ──
  if (args[0] === '--apply') {
    const salt = args[1]
    if (!salt) { console.log(`  ${C.red}Usage: bun buddy.mjs --apply "<15-char-salt>"${C.reset}\n`); process.exit(1) }
    const err = validateSalt(salt)
    if (err) { console.log(`  ${C.red}${err}${C.reset}\n`); process.exit(1) }
    const preview = roll(userId, salt)
    console.log(`  ${C.bold}Applying:${C.reset}\n`)
    displayCompanion(preview, `salt: ${salt}`)
    patchBinary(binaryPath, salt)
    console.log(`\n  ${C.bold}Restart Claude Code and run /buddy to meet your new companion!${C.reset}`)
    console.log(`  ${C.yellow}⚠  Auto-updates will overwrite this patch.${C.reset}\n`)
    return
  }

  // ── Quick --hunt ──
  if (args[0] === '--hunt') {
    if (!args[1]) { console.log(`  ${C.red}Usage: bun buddy.mjs --hunt <filter>${C.reset}\n`); process.exit(1) }
    const filter = parseFilter(args[1])
    if (!filter) { console.log(`  ${C.red}Invalid filter "${args[1]}". Run --help for examples.${C.reset}\n`); process.exit(1) }
    console.log(`  ${C.yellow}${C.bold}Hunting: ${args[1]}${C.reset}\n`)
    const results = bruteforce(userId, filter)
    if (results.length === 0) {
      console.log(`  ${C.red}No match found. Try again or broaden the filter.${C.reset}\n`)
      return
    }
    for (const r of results) {
      console.log(`  ${C.green}${C.bold}Found after ${r.attempts.toLocaleString()} attempts (${r.elapsed}s)${C.reset}`)
      console.log(`  ${C.cyan}SALT: "${r.salt}"${C.reset}\n`)
      displayCompanion(r.bones, `salt: ${r.salt}`)
    }
    return
  }

  // ── Unknown flag ──
  if (args[0] && args[0].startsWith('-')) {
    console.log(`  ${C.red}Unknown flag: ${args[0]}${C.reset}`)
    console.log(`  ${C.dim}Run --help for usage.${C.reset}\n`)
    process.exit(1)
  }

  // ── Interactive mode ──
  const currentBones = roll(userId)
  console.log(`${C.bold}  Your current companion:${C.reset}\n`)
  displayCompanion(currentBones, 'salt: ' + ORIGINAL_SALT)

  while (true) {
    console.log(`${C.bold}  What would you like to do?${C.reset}`)
    console.log(`  ${C.cyan}1${C.reset} Hunt a specific companion (bruteforce a SALT)`)
    console.log(`  ${C.cyan}2${C.reset} Roll random companions (preview)`)
    console.log(`  ${C.cyan}3${C.reset} Apply a SALT (patch binary)`)
    console.log(`  ${C.cyan}4${C.reset} Revert to original companion`)
    console.log(`  ${C.cyan}q${C.reset} Quit`)
    console.log()

    const choice = await prompt(`  ${C.bold}> ${C.reset}`)

    if (choice === 'q' || choice === '') break

    if (choice === '1') {
      console.log(`\n  ${C.bold}Enter filter:${C.reset}`)
      console.log(`  ${C.dim}Examples: legendary, epic:dragon, rare+shiny, legendary:cat+shiny${C.reset}`)
      console.log(`  ${C.dim}Rarities: ${RARITIES.join(', ')}${C.reset}`)
      console.log(`  ${C.dim}Species:  ${SPECIES.join(', ')}${C.reset}\n`)
      const filterStr = await prompt(`  ${C.bold}filter> ${C.reset}`)
      if (!filterStr) continue
      const filter = parseFilter(filterStr)
      if (!filter) { console.log(`  ${C.red}Invalid filter. Try again.${C.reset}\n`); continue }

      console.log(`\n  ${C.yellow}${C.bold}Hunting: ${filterStr}${C.reset}\n`)
      const results = bruteforce(userId, filter)

      if (results.length === 0) {
        console.log(`  ${C.red}No match found. Try again or broaden the filter.${C.reset}\n`)
        continue
      }

      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        console.log(`  ${C.green}${C.bold}[${i + 1}] Found after ${r.attempts.toLocaleString()} attempts (${r.elapsed}s)${C.reset}`)
        console.log(`  ${C.cyan}SALT: "${r.salt}"${C.reset}\n`)
        displayCompanion(r.bones, `salt: ${r.salt}`)
      }

      if (!checkWritePermission(binaryPath)) {
        console.log(`  ${C.dim}Binary is not writable. Copy a SALT and run:${C.reset}`)
        console.log(`  ${C.cyan}sudo bun buddy.mjs --apply "<salt>"${C.reset}\n`)
        continue
      }

      const picked = await prompt(`  ${C.bold}Apply which? (1-${results.length}, or Enter to skip)> ${C.reset}`)
      const idx = parseInt(picked) - 1
      if (idx >= 0 && idx < results.length) {
        console.log()
        patchBinary(binaryPath, results[idx].salt)
        console.log(`\n  ${C.bold}Restart Claude Code and run /buddy to meet your new companion!${C.reset}`)
        console.log(`  ${C.yellow}⚠  Auto-updates will overwrite this patch.${C.reset}\n`)
        break
      }
      console.log()
    }

    else if (choice === '2') {
      console.log()
      for (let i = 0; i < 5; i++) {
        const salt = randomSalt()
        const bones = roll(userId, salt)
        console.log(`  ${C.dim}[${i + 1}]${C.reset} ${C.cyan}SALT: "${salt}"${C.reset}`)
        displayCompanion(bones, `salt: ${salt}`)
      }
    }

    else if (choice === '3') {
      const salt = await prompt(`  ${C.bold}Enter SALT (${SALT_LEN} chars)> ${C.reset}`)
      const err = validateSalt(salt)
      if (err) { console.log(`  ${C.red}${err}${C.reset}\n`); continue }
      const preview = roll(userId, salt)
      console.log(`\n  ${C.bold}Preview:${C.reset}\n`)
      displayCompanion(preview, `salt: ${salt}`)
      const confirm = await prompt(`  ${C.bold}Apply this patch? (y/N)> ${C.reset}`)
      if (confirm.toLowerCase() === 'y') {
        console.log()
        patchBinary(binaryPath, salt)
        console.log(`\n  ${C.bold}Restart Claude Code and run /buddy to meet your new companion!${C.reset}`)
        console.log(`  ${C.yellow}⚠  Auto-updates will overwrite this patch.${C.reset}\n`)
        break
      }
      console.log()
    }

    else if (choice === '4') {
      try {
        revertBinary(binaryPath)
        console.log(`  ${C.dim}Restart Claude Code to get your original companion back.${C.reset}\n`)
      } catch (e) {
        console.log(`  ${C.red}${e.message}${C.reset}\n`)
      }
    }
  }
}

main().catch(e => { console.error(`\n  ${C.red}✗ ${e.message}${C.reset}\n`); process.exit(1) })
