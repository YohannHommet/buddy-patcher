# buddy-patcher

**Your buddy, your rules.**

```
    \^^^/
 }~(______)~{    Reroll your Claude Code companion.
 }~(· .. ·)~{    Single script. Zero deps. 100% local.
   ( .--. )
   (_/  \_)
```

Your Claude Code companion is determined by a hash of your user ID. You didn't choose it. It didn't choose you.

But with enough salt, anything is possible.

---

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/YohannHommet/buddy-patcher/main/buddy.mjs -o /tmp/buddy.mjs
bun /tmp/buddy.mjs
```

That's it. The interactive menu handles everything.

## What It Does

Claude Code assigns each user a companion (species, rarity, stats, hat) based on `hash(userId + salt)`. The salt is hardcoded in the binary as a 15-character string.

**buddy-patcher** bruteforces alternative salts until it finds a companion you actually want, then patches your local Claude binary.

```
  ★★ UNCOMMON  BLOB           ★★★★★ LEGENDARY  AXOLOTL ✨ SHINY
                               
     .----.                       \^^^/
    ( ×  × )        ──>       }~(______)~{
    (      )                  }~(· .. ·)~{
     `----´                     ( .--. )
                                (_/  \_)
  CHAOS      94                WISDOM     100
```

## Usage

### Interactive (recommended)

```bash
bun buddy.mjs
```

Auto-detects your userId and Claude binary. Browse, hunt, preview, patch — all from one menu.

### CLI Flags

```bash
bun buddy.mjs --hunt legendary           # Find legendary companions
bun buddy.mjs --hunt epic:dragon+shiny   # The holy grail
bun buddy.mjs --apply "your-15char-salt" # Patch with a known salt
bun buddy.mjs --revert                   # Restore original companion
bun buddy.mjs --help                     # Full usage
```

### Filter Syntax

| Filter | Matches |
|---|---|
| `legendary` | Any legendary |
| `dragon` | Any dragon |
| `epic:cat` | Epic cats only |
| `rare+shiny` | Rare and shiny |
| `legendary:axolotl+shiny` | You know what you want |

## How It Works

1. Reads your `accountUuid` from `~/.claude.json`
2. Locates the Claude binary via `which claude`
3. Reproduces the exact companion generation algorithm (Mulberry32 PRNG + Bun.hash/wyhash)
4. Bruteforces random 15-character salts until a match is found
5. Patches the binary with a simple byte substitution (backup created first)

The script is a single 500-line file with zero dependencies. Read it before you run it — that's the point.

## Requirements

- **Bun** (ships with Claude Code, or [install it](https://bun.sh))
- **Claude Code** (obviously)
- Write access to the Claude binary (or `sudo`)

## FAQ

### Is this safe?

The script creates a backup before patching. Run `--revert` to restore. The patch is a simple string replacement — same length, same position, no structural changes.

### What happens when Claude updates?

Auto-updates overwrite the binary. Re-run the script with the same salt:

```bash
bun buddy.mjs --apply "your-salt-here"
```

### Does my UUID leave my machine?

No. Everything runs locally. There is no network call. Read the source.

### Why Bun?

Claude Code uses `Bun.hash()` (wyhash) for the companion hash. Node.js has a different hash function. The results must be bit-exact — Bun is the only way.

### Can I preview without patching?

Yes. The interactive menu option `2` rolls random companions. Option `1` hunts for specific matches. You choose whether to apply or not.

## Companion Odds

| Rarity | Chance | Stars |
|---|---|---|
| Common | 60% | ★ |
| Uncommon | 25% | ★★ |
| Rare | 10% | ★★★ |
| Epic | 4% | ★★★★ |
| Legendary | 1% | ★★★★★ |
| Shiny | 1% | ✨ (independent) |

18 species. 6 eye styles. 8 hat types. 5 stats. Infinite salt space.

## Species

```
duck     goose    blob     cat      dragon   octopus
owl      penguin  turtle   snail    ghost    axolotl
capybara cactus   robot    rabbit   mushroom chonk
```

## Credits

Companion generation algorithm reverse-engineered from [claude-code source](https://github.com/zackautocracy/claude-code/tree/main/src/buddy).

## License

MIT
