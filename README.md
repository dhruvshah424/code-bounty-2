# Code Bounty 2.0

Ported from the working vanilla build to **React + Vite**. The experience is exactly the same sequence: intro cutscene (`intro-scene.mp4`) → playable slingshot level **"THE BOUNTY GATE"** (towers spell `CODE BOUNTY 2.0`) → Mighty Eagle cinematic → reveal → CTA. The site scrolls **left → right only** (one home panel + exactly one blank placeholder panel), with no nav bar, section links, progress bar, or SCROLL cue.

## Setup

```bash
npm i
npm run dev   # http://localhost:5173
npm run build
npm run preview
npm run lint
```

## Assets

Drop your files in `public/assets/`. The engine resolves every path through `import.meta.env.BASE_URL`, so both root and sub-path deploys work.

| File | Notes |
|---|---|
| `intro-scene.mp4` | Video-only cutscene (640×360, ~7.07s in the reference). Plays muted/inline, shows `SKIP →` bottom-right almost immediately. Finishes on `ended` or `CONFIG.intro.duration` (default 7400 ms — keep slightly longer than your clip). Plays once per browser session; add `?intro=1` to replay. |
| `sound-can.mp3` | Chain cue 1: starts the moment the can leaves the slingshot. |
| `sound-eagle.mp3` | Chain cue 2: plays after `sound-can.mp3` ends. The Mighty Eagle flies in on this cue's last beat. |
| `sound-flyby.mp3` | Chain cue 3: plays when `sound-eagle.mp3` ends. This is the flyby that accompanies the eagle entering the screen. **Currently 0 bytes** in this repo — swap in the real file for that third beat to play. The code skips an empty/undecodable cue so the chain never stalls. |
| `fish-box.png` | Optional sardine can sprite. If missing (or forced with `?fish=art`) the procedural fish is used. Auto-trimmed to opaque bounds. |
| `mighty-eagle.png` | Optional eagle sprite. The reference is a WebP mislabelled `.png` — browsers sniff it fine; you can rename to `.webp` if your host is strict. Forced with `?eagle=art` to compare against the procedural version. |
| `background.png` | Opaque 16:9 background. When present it replaces the painted sky/hills/clouds/grass. See `CONFIG.render.background` or `?bg=off|full`. |
| `towers.png` | Optional reference sheet for alignment; drawn only with `?guides=1` as a translucent overlay. |

~15 MB of unused assets in `public/assets/` will be copied into `dist/` by Vite — this is intentional (they are the original drop-in slots).

## URL flags

| Flag | Values | Effect |
|---|---|---|
| `?motion=` | `full` / `reduce` | Override `prefers-reduced-motion`. `reduce` skips the intro cinematic and shortens cinematic pauses. |
| `?intro=1` | — | Force the intro cutscene to play again (ignores the once-per-session guard). |
| `?guides=1` | — | Show the translucent tower reference overlay (`assets/towers.png`) for pixel-perfect placement. |
| `?bg=` | `off` / `full` | `off` = force procedural scenery (ignore `background.png`). `full` = draw every procedural layer on top of the background image. |
| `?fish=` | `art` | Force the built-in procedural sardine can art (useful to A/B against `fish-box.png`). |
| `?eagle=` | `art` | Force the built-in procedural Mighty Eagle art (useful to A/B against `mighty-eagle.png`). |

## Tuning

Nearly everything lives in [`src/game/config.js`](src/game/config.js): physics gravity, slingshot max pull/power, tower layout (`cell`, `gap`, `baselineY`, `startX`), timing (`impactToEagle`, `eagleDuration`, `hintDelay`, `autoPlayDelay`), reveal copy, audio cues/volume/fade and `stopFlybyOnEagleExit` (set `false` to let a long `sound-flyby.mp3` ring out after the eagle exits).

## Notes

- **Horizontal-only scroll.** A vertical wheel gesture is translated into horizontal travel. The strip snaps to exactly one full viewport per panel. Arrow keys, PageUp/PageDown, Home/End also navigate.
- **One blank placeholder.** Exactly one `<section class="panel panel--blank">` after the hero. Remove it if you do not want to scroll past the game.
- **Sound is gesture-gated.** Audio starts only after the first user interaction (pointer/touch/keyboard). The toggle is icon-only (`🔊` / `🔇`), bottom-right.
- **Three-cue chain is the source of truth for the eagle.** `playCan()` runs `sound-can → sound-eagle → (eagle flies in)`; `playFlyby()` plays `sound-flyby` at eagle entry. If the chain cannot play (muted/failed/empty) the engine falls back to a plain timer, so the level can never stall.
- **StrictMode safe.** The engine exposes `destroy()` and every timer/event listener is tracked and cleaned up on unmount/replay.
- **Deterministic level.** `world.seed` in config makes the block towers identical every load.
- **No CDN.** `matter-js` is installed from npm (`^0.20.0`) and bundled by Vite. All assets are local.

### Known small thing
`public/assets/sound-flyby.mp3` is **0 bytes** in this checkout. Replace it with the real track to hear the third beat of the audio chain. The game will still run and reach the reveal if it is missing/empty.
