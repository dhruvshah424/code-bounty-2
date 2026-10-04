/* ==========================================================================
   App.jsx — Code Bounty 2.0 (single-file build)
   --------------------------------------------------------------------------
   The intro cutscene, the playable slingshot level, the Mighty Eagle cinematic
   and the CTA all live in this one component file. Everything that used to be
   split across src/game/*, src/hooks/* and src/components/* is inlined below as
   clearly labelled "module" sections. main.jsx mounts this component and
   style.css holds every style. Three files, total.
   ========================================================================== */
import { useCallback, useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

/* ============================ game/config.js ============================ */
const config = (() => {
/* ==========================================================================
   Code Bounty 2.0 — config.js
   --------------------------------------------------------------------------
   Everything you would want to edit lives in this file:
     • event details + the register link
     • every gameplay tunable (physics, slingshot power, tower layout)
     • the three audio cues
     • asset slots for the drop-in sprites

   Asset paths are resolved through import.meta.env.BASE_URL so the build works
   whether it is deployed at the domain root or in a sub-folder.
   ========================================================================== */

const BASE = import.meta.env.BASE_URL || '/';

/**
 * Resolve a file in `public/assets/`.
 *
 * Everything goes through BASE_URL so the same build works whether it is
 * deployed at the domain root or inside a sub-folder.
 */
const assetUrl = (file) => BASE + 'assets/' + file;

const asset = assetUrl;

const CONFIG = {
  /* ---------------------------------------------------------------- EVENT */
  event: {
    name: 'CODE BOUNTY 2.0',
    sub: '36 hours. One repository. Zero excuses.',
    // Where REGISTER NOW goes. Put your real registration form here
    // (Google Form / Typeform / …).
    registerUrl: '#register',
    // Where EXPLORE EVENT goes. Falls back to registerUrl when empty.
    exploreUrl: ''
  },

  /* ---------------------------------------------------------------- WORLD
     Design resolution. The canvas scales this world to fit the viewport
     ("contain"), so the whole level is always visible on any screen size. */
  world: {
    w: 1920,
    h: 1080,
    groundY: 900, // y of the grass surface
    seed: 20260202 // deterministic randomness -> identical level every load
  },

  /* --------------------------------------------------------------- CAMERA */
  camera: {
    zoomIdle: 1.0,
    zoomFollow: 1.0, // no zoom — the sculpture must never move under the camera
    zoomEagle: 1.0, // no cinematic push-in either, for the same reason
    followEase: 0.06,
    zoomEase: 0.05,
    shakeDecay: 0.78, // per frame — lower = shorter shake
    shakeMax: 34
  },

  /* -------------------------------------------------------------- PHYSICS
     Matter gravity. Effective acceleration in px/step^2 is derived at runtime
     as gravity.y * 0.001 * (1000/60)^2 = gravity.y * 0.2777
     (see physics.js) so the trajectory preview always matches the sim. */
  physics: {
    gravity: { x: 0, y: 0.27 },
    maxDebris: 260, // hard cap on loose blocks for performance
    frictionAir: 0.012,
    impactSpeed: 3.2, // min projectile speed that damages a block
    slowMoEagle: 0.62 // cinematic slow-motion factor
  },

  /* ------------------------------------------------------------- SLINGSHOT */
  sling: {
    x: 115, // fork anchor (world) — further left
    y: 495, // fork anchor height — a touch higher off the ground
    maxPull: 170, // max drag distance in world px
    power: 0.105, // launch speed = pull * power (only used for the drag feel)
    radius: 38, // hit radius / sprite size of the sardine can
    minPull: 14, // below this a release is treated as a cancel
    artScale: 1.6, // slingshot sprite size so its fork reaches the can (world scale)
    // Time from the can leaving the sling to touching the tower. The launch
    // velocity is solved so every shot — manual or auto — lands in exactly
    // this long, regardless of how far the target is.
    flightMs: 3000
  },

  /* ---------------------------------------------------------------- TOWERS
     The hero title is a block sculpture spelling CODE / BOUNTY / 2.0, authored
     in structure.js in 74x42 "units" (one group per letter). Each letter is a
     separate destructible building of wood / stone / glass with pigs and TNT. */
  towers: {
    unit: 17, // world px per unit -> bigger sculpture (CODE BOUNTY 2.0 is the hero)
    cell: 17, // approx. one block, used by the auto-play aim search
    centerX: 1020 // horizontal centre of the whole sculpture (a touch right of middle)
  },

  /* ---------------------------------------------------------------- REVEAL
     Drawn *behind* the block towers, so smashing them acts like tearing a
     curtain away from the event branding. */
  reveal: {
    title: 'CODE BOUNTY 2.0',
    sub: '36 hours. One repository. Zero excuses.'
  },

  /* ---------------------------------------------------------------- TIMING */
  timing: {
    hintDelay: 2.6, // s before the "drag me" bubble appears
    impactToEagle: 620, // ms between first impact and the eagle entrance
    eagleDuration: 1500, // ms for the whole eagle flight — snappy in-and-out pass
    eagleRadius: 50, // world radius of the eagle's destruction sweep — tuned so blocks only break as the eagle reaches them
    revealHold: 260 // ms pause before the CTA pops in
  },

  /* ---------------------------------------------------------------- INTRO */
  intro: {
    // assets/intro-scene.mp4 is 7.07s long and loops, so this safety timer is
    // the real exit. Raise it if you swap in a longer clip — it should be a
    // little *longer* than the clip so a normal playthrough finishes on the
    // clip's own `ended` event rather than being cut off.
    duration: 7400,
    rememberKey: 'cb2_intro_seen'
  },

  /* ---------------------------------------------------------------- AUDIO
     Three tracks, played as one chain (see audio.js):
       can    → the moment the sardine can leaves the slingshot
       eagle  → when sound-can ends; the eagle flies in on this one's last beat
       flyby  → as the Mighty Eagle enters
     A cue that is missing or undecodable is skipped, and the chain still
     completes, so a bad asset can never freeze the level. */
  audio: {
    cues: {
      can: asset('sound-can.mp3'),
      eagle: asset('sound-eagle.mp3'),
      flyby: asset('sound-flyby.mp3')
    },
    enabledByDefault: true, // context only starts after a user gesture
    volume: 0.8,
    stopFade: 0.25,
    // The eagle's flight is ~3.7s. If your sound-flyby.mp3 is longer than that
    // it gets cut off here; set this false to let it ring out on its own.
    stopFlybyOnEagleExit: true,
    // While the cue chain is driving the eagle's entrance the engine waits for
    // it, but arms this safety net. It is longer than the whole chain
    // (sound-can + sound-eagle ≈ 6.2 s) so it never cuts the music short, yet
    // short enough that a stalled/dead chain still brings the eagle promptly.
    eagleFallbackMs: 8000,
    storageKey: 'cb2_sound'
  },

  /* --------------------------------------------------------------- RENDER */
  render: {
    maxParticles: 600, // hard particle pool size (ring buffer)

    background: {
      // assets/background.png is an opaque 16:9 scene. When it loads it replaces
      // the procedural scenery. Flip these flags (or use ?bg=off / ?bg=full) if
      // you want the built-in layers drawn on top of it instead.
      use: true, // draw the background image
      hideGround: true, // suppress the procedural grass strip
      hideHills: true,
      hideClouds: true,
      hideProps: true,
      parallax: 0 // 0 = fixed to the viewport, 1 = moves with the world
    }
  },

  /* --------------------------------------------------------------- ASSETS
     Drop-in slots. If a file exists it is used, otherwise the game falls back
     to the procedurally drawn art (which is the default and looks fine).

       assets/fish-box.png     -> the sardine can sprite
       assets/mighty-eagle.png -> the Mighty Eagle sprite. NOTE: this file is
                                  actually a WebP with a .png extension — that
                                  is fine in every browser, but rename it to
                                  mighty-eagle.webp if your host is strict.
       assets/background.png   -> full-scene background (opaque, 16:9)
       assets/towers.png       -> your tower reference sheet. Loaded only when
                                  the page is opened with ?guides=1 and drawn
                                  as a translucent alignment guide over the
                                  level, so you can position the generated
                                  towers to match your mockup pixel for pixel.

     Every sprite is auto-trimmed to its opaque bounds on load, so you can
     export them with wide transparent margins and they will still size
     correctly. Set any slot to '' to force the procedural art.               */
  assets: {
    fish: asset('fish-box.png'),
    eagle: asset('mighty-eagle.png'),
    background: asset('background.png'),
    towerGuide: asset('towers.png'),
    // Block textures and the slingshot (procedural art is used if missing)
    wood: asset('wood-block.png'),
    stone: asset('stone-block.png'),
    glass: asset('glass-block.png'),
    tnt: asset('tnt.png'),
    slingshot: asset('slingshot.png'),
    pig: asset('pig.png'),
    eagleWidth: 168, // world px across the eagle sprite at scale 1
    eagleFlip: false, // set true if your sprite faces left
    // Screen-size multiplier for the Mighty Eagle: 1 = one cell of a 3x3 grid
    // (a third of the viewport width). Bumped well above 1 so it reads as huge.
    eagleScale: 1.7
  }
};

CONFIG;


return { assetUrl, CONFIG };
})();

const CONFIG = config.CONFIG;
const assetUrl = config.assetUrl;

/* ============================ game/art.js ============================ */
const art = (() => {
/* ==========================================================================
   Code Bounty 2.0 — art.js
   --------------------------------------------------------------------------
   Every sprite in the game is drawn procedurally into offscreen canvases
   (wood, stone, glass, TNT, sardine can, clouds, hills, islands, eagle, pig).

   WHY PROCEDURAL?
     • zero image dependencies -> the site works offline and on any host
     • blocks can be generated at the exact size the level needs

   ASSET SLOTS
     Drop `assets/fish-box.png` next to index.html and the sardine can sprite
     is replaced by your image automatically (art.loadAssets()).
     Drop `assets/towers.png` and open the page with ?guides=1 to overlay your
     tower reference sheet on top of the generated level, so you can line the
     structures up with your mockup.
   ========================================================================== */

  const A = {};
  const SS = 2; // supersample factor for cached textures

  /* ------------------------------------------------------------ helpers */
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
const rng = mulberry32;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * SS));
    c.height = Math.max(1, Math.ceil(h * SS));
    const ctx = c.getContext('2d');
    ctx.scale(SS, SS);
    c._w = w;
    c._h = h;
    return { c, ctx };
  }

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, rad);
      return;
    }
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function speckle(ctx, w, h, n, rand, color, rMin, rMax) {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = color;
      const r = rMin + rand() * (rMax - rMin);
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ============================================================ TEXTURES */

  const texCache = new Map();
  const tintCache = new Map();

  /* Average colour of a block PNG's opaque pixels. Baking this behind the
     texture fills its transparent rounded corners so neighbouring blocks read
     as literally touching (no background showing through the seams). */
  function materialTint(mat, img, box) {
    if (tintCache.has(mat)) return tintCache.get(mat);
    const N = 20;
    const c = document.createElement('canvas');
    c.width = N;
    c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (box) g.drawImage(img, box.sx, box.sy, box.sw, box.sh, 0, 0, N, N);
    else g.drawImage(img, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    let r = 0, gr = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 40) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; }
    }
    const tint = n ? { r: Math.round(r / n), g: Math.round(gr / n), b: Math.round(b / n) } : null;
    tintCache.set(mat, tint);
    return tint;
  }

  function wood(ctx, w, h, rand) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#c98a4b');
    g.addColorStop(0.45, '#b1703a');
    g.addColorStop(1, '#8d5528');
    rr(ctx, 0, 0, w, h, Math.min(4, h / 4));
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    rr(ctx, 0, 0, w, h, Math.min(4, h / 4));
    ctx.clip();

    // grain
    ctx.lineWidth = 1;
    for (let i = 0; i < h / 3.2; i++) {
      const y = rand() * h;
      ctx.strokeStyle = 'rgba(90,52,22,' + (0.05 + rand() * 0.12).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(-2, y);
      ctx.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * 3, w * 0.7, y + (rand() - 0.5) * 3, w + 2, y);
      ctx.stroke();
    }
    // knot
    if (w > 26 && h > 12 && rand() > 0.45) {
      ctx.strokeStyle = 'rgba(88,50,20,.28)';
      ctx.beginPath();
      ctx.ellipse(w * (0.25 + rand() * 0.5), h * 0.5, Math.min(w, h) * 0.16, Math.min(w, h) * 0.1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // top highlight
    ctx.fillStyle = 'rgba(255,225,190,.22)';
    ctx.fillRect(0, 0, w, 2);
    ctx.restore();

    // border + nails
    rr(ctx, 0.75, 0.75, w - 1.5, h - 1.5, Math.min(4, h / 4));
    ctx.strokeStyle = '#63391a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (w > 30 && h > 10) {
      ctx.fillStyle = 'rgba(70,40,18,.75)';
      [3.5, w - 3.5].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x, h / 2, 1.7, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function stone(ctx, w, h, rand) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#b3bdc4');
    g.addColorStop(0.5, '#8d979e');
    g.addColorStop(1, '#6d777d');
    rr(ctx, 0, 0, w, h, 5);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    rr(ctx, 0, 0, w, h, 5);
    ctx.clip();
    speckle(ctx, w, h, Math.max(6, (w * h) / 90), rand, 'rgba(60,70,78,.16)', 0.6, 2.1);
    speckle(ctx, w, h, Math.max(3, (w * h) / 220), rand, 'rgba(255,255,255,.2)', 0.5, 1.4);
    // bevel
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1, h - 2);
    ctx.lineTo(1, 1);
    ctx.lineTo(w - 2, 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30,40,48,.3)';
    ctx.beginPath();
    ctx.moveTo(w - 1.5, 2);
    ctx.lineTo(w - 1.5, h - 1.5);
    ctx.lineTo(2, h - 1.5);
    ctx.stroke();
    // crack
    if (w > 30 && h > 16 && rand() > 0.5) {
      ctx.strokeStyle = 'rgba(40,48,54,.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const sx = rand() * w;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + (rand() - 0.5) * 8, h * 0.5);
      ctx.lineTo(sx + (rand() - 0.5) * 14, h);
      ctx.stroke();
    }
    ctx.restore();

    rr(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 5);
    ctx.strokeStyle = '#4f585d';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  function glass(ctx, w, h) {
    rr(ctx, 0, 0, w, h, 3);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(196,244,255,.46)');
    g.addColorStop(0.5, 'rgba(126,208,240,.26)');
    g.addColorStop(1, 'rgba(196,244,255,.4)');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    rr(ctx, 0, 0, w, h, 3);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.moveTo(-4, h);
    ctx.lineTo(w * 0.45, -4);
    ctx.lineTo(w * 0.62, -4);
    ctx.lineTo(w * 0.13, h + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath();
    ctx.moveTo(w * 0.55, h + 4);
    ctx.lineTo(w + 4, -4);
    ctx.lineTo(w + 4, h * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    rr(ctx, 1, 1, w - 2, h - 2, 3);
    ctx.strokeStyle = 'rgba(226,252,255,.92)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  function tnt(ctx, w, h) {
    rr(ctx, 0, 0, w, h, 3);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#c44334');
    g.addColorStop(1, '#8f2519');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    rr(ctx, 0, 0, w, h, 3);
    ctx.clip();
    // hazard stripes
    const sh = Math.max(4, h * 0.16);
    ctx.fillStyle = '#f2c53d';
    ctx.fillRect(0, h - sh, w, sh);
    ctx.fillStyle = 'rgba(40,20,10,.65)';
    for (let x = -h; x < w; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + sh * 0.55, h);
      ctx.lineTo(x + sh * 0.55 + h, h - sh);
      ctx.lineTo(x + h, h - sh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(0, 0, w, 2.5);
    ctx.restore();

    if (w >= 26 && h >= 16) {
      ctx.fillStyle = '#fff6e6';
      ctx.font = '700 ' + Math.min(h * 0.52, w * 0.34).toFixed(1) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(60,10,4,.8)';
      ctx.lineWidth = 2.5;
      ctx.strokeText('TNT', w / 2, h * 0.42);
      ctx.fillText('TNT', w / 2, h * 0.42);
    }

    rr(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 3);
    ctx.strokeStyle = '#5d1a11';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  /** Cached block texture. mat: wood | stone | glass | tnt */
function block(mat, w, h) {
    const W = Math.max(3, Math.round(w));
    const H = Math.max(3, Math.round(h));
    const key = mat + '_' + W + 'x' + H;
    if (texCache.has(key)) return texCache.get(key);

    // Prefer the drop-in PNG texture when it has loaded, else go procedural.
    let img = null;
    let box = null;
    if (mat === 'stone' && stoneImage) { img = stoneImage; box = stoneBox; }
    else if (mat === 'glass' && glassImage) { img = glassImage; box = glassBox; }
    else if (mat === 'tnt' && tntImage) { img = tntImage; box = tntBox; }
    else if ((mat === 'wood' || !mat) && woodImage) { img = woodImage; box = woodBox; }
    if (img) {
      const o = canvas(W, H);
      const tint = materialTint(mat, img, box);
      if (tint) {
        o.ctx.save();
        o.ctx.globalAlpha = mat === 'glass' ? 0.55 : 1;
        o.ctx.fillStyle = 'rgb(' + tint.r + ',' + tint.g + ',' + tint.b + ')';
        o.ctx.fillRect(0, 0, W, H);
        o.ctx.restore();
      }
      if (box) o.ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, 0, 0, W, H);
      else o.ctx.drawImage(img, 0, 0, W, H);
      texCache.set(key, o.c);
      return o.c;
    }

    const o = canvas(W, H);
    const rand = mulberry32(W * 73856093 ^ H * 19349663 ^ mat.length * 83492791);
    if (mat === 'stone') stone(o.ctx, W, H, rand);
    else if (mat === 'glass') glass(o.ctx, W, H);
    else if (mat === 'tnt') tnt(o.ctx, W, H);
    else wood(o.ctx, W, H, rand);
    texCache.set(key, o.c);
    return o.c;
  };

  /* ======================================================= SARDINE CAN */

  function fallbackFish(size) {
    const w = size * 0.8;
    const h = size;
    const o = canvas(w, h);
    const ctx = o.ctx;

    // can body
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#9fb0ba');
    g.addColorStop(0.28, '#e9f1f5');
    g.addColorStop(0.62, '#c8d5dc');
    g.addColorStop(1, '#8797a2');
    rr(ctx, 0, 2, w, h - 4, w * 0.16);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#5c6a74';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // rims
    [2, h - 2].forEach((y) => {
      ctx.fillStyle = '#eef4f7';
      ctx.beginPath();
      ctx.ellipse(w / 2, y, w / 2 - 0.5, Math.max(2.5, h * 0.075), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#788892';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    });

    // label
    const ly = h * 0.2;
    const lh = h * 0.56;
    ctx.save();
    rr(ctx, w * 0.06, ly, w * 0.88, lh, 2);
    ctx.clip();
    const lg = ctx.createLinearGradient(0, ly, 0, ly + lh);
    lg.addColorStop(0, '#2f86c9');
    lg.addColorStop(0.55, '#1b5e9b');
    lg.addColorStop(1, '#134a7d');
    ctx.fillStyle = lg;
    ctx.fillRect(0, ly, w, lh);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(0, ly + 1, w, Math.max(1.4, h * 0.03));
    ctx.fillRect(0, ly + lh - Math.max(1.4, h * 0.03), w, Math.max(1.4, h * 0.03));

    // fish silhouette
    const fx = w * 0.5;
    const fy = ly + lh * 0.46;
    const fw = w * 0.56;
    const fh = lh * 0.34;
    ctx.fillStyle = '#f4fbff';
    ctx.beginPath();
    ctx.ellipse(fx - fw * 0.06, fy, fw * 0.34, fh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx + fw * 0.26, fy);
    ctx.lineTo(fx + fw * 0.52, fy - fh * 0.52);
    ctx.lineTo(fx + fw * 0.52, fy + fh * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx - fw * 0.06, fy - fh * 0.42);
    ctx.lineTo(fx + fw * 0.1, fy - fh * 0.72);
    ctx.lineTo(fx + fw * 0.2, fy - fh * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1b5e9b';
    ctx.beginPath();
    ctx.arc(fx - fw * 0.24, fy - fh * 0.1, Math.max(1, fh * 0.09), 0, Math.PI * 2);
    ctx.fill();

    // caption
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.font = '700 ' + Math.max(4, h * 0.1).toFixed(1) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SARDINE', fx, ly + lh * 0.88);
    ctx.restore();

    // specular
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.16);
    ctx.lineTo(w * 0.24, h * 0.16);
    ctx.lineTo(w * 0.12, h * 0.78);
    ctx.closePath();
    ctx.fill();

    return o.c;
  }

  let fishFallback = null;

  /** Draw the sardine can centred at 0,0 in a transformed context. */
function drawFish(ctx, size) {
    if (fishImage && !forceArt.fish) {
      drawCentered(ctx, fishImage, fishBox, size * 1.04);
      return;
    }
    if (!fishFallback || fishFallback._w !== size * 0.8) fishFallback = fallbackFish(size);
    ctx.drawImage(fishFallback, (-size * 0.8) / 2, -size / 2, size * 0.8, size);
  };

  /* ============================================================ SLINGSHOT */

  /**
   * Draws the slingshot. `pull` is the offset of the pouch from rest
   * ({x,y} in world units) so the bands can stretch with it.
   */
function slingTips(x, y, groundY, scale) {
    scale = (typeof scale === 'number' && isFinite(scale)) ? scale : 1;
    if (slingImage && !forceArt.sling) {
      const ar = slingBox ? slingBox.sh / slingBox.sw : slingImage.height / slingImage.width;
      const w = 150 * scale;
      const h = w * ar;
      // The fork tips sit on `y` (not the ground), so moving sling.y lifts the
      // whole sprite and the bands/can follow it exactly.
      const by = y - h * 0.1;
      return {
        t1x: x - w * 0.2, t1y: by + h * 0.1,
        t2x: x + w * 0.2, t2y: by + h * 0.1
      };
    }
    return {
      t1x: x - 30 * scale, t1y: y - 36 * scale,
      t2x: x + 30 * scale, t2y: y - 36 * scale
    };
  }

function drawSling(ctx, x, y, groundY, pull, scale) {
    scale = (typeof scale === 'number' && isFinite(scale)) ? scale : 1;
    const tips = slingTips(x, y, groundY, scale);

    // Drop-in slingshot sprite (falls back to the procedural fork below).
    if (slingImage && !forceArt.sling) {
      const ar = slingBox ? slingBox.sh / slingBox.sw : slingImage.height / slingImage.width;
      const w = 150 * scale;
      const h = w * ar;
      const bx = x - w / 2;
      // Anchor by the fork (y) so sling.y lifts the sprite off the ground.
      const by = y - h * 0.1;
      ctx.save();
      if (slingBox) ctx.drawImage(slingImage, slingBox.sx, slingBox.sy, slingBox.sw, slingBox.sh, bx, by, w, h);
      else ctx.drawImage(slingImage, bx, by, w, h);
      ctx.restore();
      return tips;
    }

    const t1x = tips.t1x, t1y = tips.t1y; // left prong tip
    const t2x = tips.t2x, t2y = tips.t2y; // right prong tip

    ctx.save();
    ctx.lineCap = 'round';

    // shadow
    ctx.fillStyle = 'rgba(40,26,12,.2)';
    ctx.beginPath();
    ctx.ellipse(x + 6 * scale, groundY + 3, 54 * scale, 9 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs
    const gx0 = x - 50 * scale;
    const gx1 = x + 54 * scale;
    let legGrad;
    if (Number.isFinite(gx0) && Number.isFinite(gx1)) {
      legGrad = ctx.createLinearGradient(gx0, 0, gx1, 0);
      legGrad.addColorStop(0, '#6b4423');
      legGrad.addColorStop(0.4, '#9c6a37');
      legGrad.addColorStop(0.62, '#7d5127');
      legGrad.addColorStop(1, '#5b3819');
    } else {
      legGrad = '#7d5127';
    }

    function leg(x1, y1, x2, y2, wdt) {
      ctx.strokeStyle = legGrad;
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,36,16,.55)';
      ctx.lineWidth = wdt * 0.22;
      ctx.beginPath();
      ctx.moveTo(x1 + wdt * 0.16, y1);
      ctx.lineTo(x2 + wdt * 0.16, y2);
      ctx.stroke();
    }

    // back leg
    leg(x - 6 * scale, y + 8 * scale, x - 46 * scale, groundY - 2, 19 * scale);
    // back prong
    ctx.strokeStyle = legGrad;
    ctx.lineWidth = 15 * scale;
    ctx.beginPath();
    ctx.moveTo(x - 6 * scale, y + 8 * scale);
    ctx.lineTo(t1x, t1y);
    ctx.stroke();
    // front leg
    leg(x + 8 * scale, y + 4 * scale, x + 50 * scale, groundY - 2, 22 * scale);
    // front prong
    ctx.lineWidth = 17 * scale;
    ctx.beginPath();
    ctx.moveTo(x + 6 * scale, y + 6 * scale);
    ctx.lineTo(t2x, t2y);
    ctx.stroke();

    // leather binding at the crotch
    ctx.strokeStyle = '#4a2a15';
    ctx.lineWidth = 15 * scale;
    ctx.beginPath();
    ctx.moveTo(x - 12 * scale, y - 16 * scale);
    ctx.lineTo(x + 14 * scale, y - 20 * scale);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,170,.18)';
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(x - 10 * scale, y - 21 * scale);
    ctx.lineTo(x + 12 * scale, y - 25 * scale);
    ctx.stroke();

    ctx.restore();
    return { t1x, t1y, t2x, t2y };
  };

  /** Elastic band from both prong tips through the pouch. */
function drawBands(ctx, tips, px, py, scale) {
    const back = { x: px - 12 * scale, y: py + 4 * scale };
    const front = { x: px + 14 * scale, y: py + 2 * scale };
    ctx.save();
    ctx.lineCap = 'round';
    // back band
    ctx.strokeStyle = '#3d2412';
    ctx.lineWidth = 9 * scale;
    ctx.beginPath();
    ctx.moveTo(tips.t1x, tips.t1y);
    ctx.lineTo(back.x, back.y);
    ctx.lineTo(tips.t2x, tips.t2y);
    ctx.stroke();
    // pouch
    ctx.fillStyle = '#2f1c0e';
    rr(ctx, front.x - 15 * scale, front.y - 12 * scale, 30 * scale, 24 * scale, 7 * scale);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,210,150,.14)';
    ctx.fillRect(front.x - 12 * scale, front.y - 10 * scale, 24 * scale, 4 * scale);
    // front band (over the can)
    ctx.strokeStyle = '#4f2f16';
    ctx.lineWidth = 7 * scale;
    ctx.beginPath();
    ctx.moveTo(tips.t2x, tips.t2y);
    ctx.lineTo(front.x, front.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(front.x, front.y);
    ctx.lineTo(tips.t1x, tips.t1y);
    ctx.stroke();
    ctx.restore();
  };

  /* ================================================================== PIG */

function drawPig(ctx, r, t, hurt) {
    // Drop-in sprite: draw it centred on the body, sized to the pig radius.
    if (pigImage) {
      drawCentered(ctx, pigImage, pigBox, r * 2.35);
      return;
    }
    ctx.save();
    // ears
    ctx.fillStyle = '#5fae3c';
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.ellipse(s * r * 0.62, -r * 0.72, r * 0.26, r * 0.34, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // body
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r * 1.15);
    g.addColorStop(0, hurt ? '#c8e86a' : '#8fd657');
    g.addColorStop(0.65, hurt ? '#96c93f' : '#63b03a');
    g.addColorStop(1, '#3f7d24');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#37701f';
    ctx.lineWidth = Math.max(1.4, r * 0.07);
    ctx.stroke();

    // eyes
    [-1, 1].forEach((s) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s * r * 0.36, -r * 0.22, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d2b16';
      const px = s * r * 0.36 + Math.sin(t * 0.004 + s) * r * 0.06;
      ctx.beginPath();
      ctx.arc(px, -r * 0.2, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    });
    // brows
    ctx.strokeStyle = 'rgba(40,80,20,.7)';
    ctx.lineWidth = Math.max(1.2, r * 0.08);
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.62, -r * 0.56);
      ctx.lineTo(s * r * 0.16, -r * 0.46);
      ctx.stroke();
    });
    // snout
    ctx.fillStyle = '#a9dd72';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, r * 0.46, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4b8a29';
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#3d7422';
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.ellipse(s * r * 0.17, r * 0.3, r * 0.09, r * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  };

  /* ================================================================= EAGLE

     Drawn live so the wings can flap. `ang` is the flight angle in radians. */
function drawEagle(ctx, ang, flap, scale) {
    if (eagleImage && !forceArt.eagle) {
      // sprite eagle: the wings cannot flap, so fake the beat with a squash
      // along the flight axis' normal — reads as a wingbeat at 60fps.
      ctx.save();
      ctx.rotate(ang);
      const beat = 1 - Math.abs(Math.sin(flap)) * 0.13;
      ctx.scale(eagleFlip ? -1 : 1, beat);
      drawCentered(ctx, eagleImage, eagleBox, eagleBaseW * scale);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.rotate(ang);

    const wing = function (dir) {
      const lift = -Math.abs(Math.sin(flap)) * 26 * scale + 8 * scale;
      ctx.save();
      ctx.scale(1, dir);
      ctx.beginPath();
      ctx.moveTo(-6 * scale, 0);
      ctx.quadraticCurveTo(-30 * scale, -10 * scale + lift * 0.5, -62 * scale, -8 * scale + lift);
      ctx.quadraticCurveTo(-70 * scale, -4 * scale + lift, -64 * scale, 8 * scale + lift * 0.7);
      ctx.quadraticCurveTo(-38 * scale, 12 * scale, -4 * scale, 7 * scale);
      ctx.closePath();
      const wg = ctx.createLinearGradient(-6 * scale, 0, -64 * scale, 0);
      wg.addColorStop(0, '#4b3421');
      wg.addColorStop(0.55, '#6d4c2d');
      wg.addColorStop(1, '#3a2717');
      ctx.fillStyle = wg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,10,.55)';
      ctx.lineWidth = 1.4 * scale;
      ctx.stroke();
      // feather tips
      ctx.strokeStyle = 'rgba(20,14,8,.5)';
      ctx.lineWidth = 1 * scale;
      for (let i = 0; i < 4; i++) {
        const fx = -22 * scale - i * 12 * scale;
        const fy = -2 * scale + lift * (0.6 + i * 0.1);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx - 8 * scale, fy + 4 * scale);
        ctx.stroke();
      }
      ctx.restore();
    };

    wing(1);
    wing(-1);

    // tail
    ctx.fillStyle = '#3f2c19';
    ctx.beginPath();
    ctx.moveTo(-18 * scale, -5 * scale);
    ctx.lineTo(-46 * scale, -11 * scale);
    ctx.lineTo(-46 * scale, 11 * scale);
    ctx.lineTo(-18 * scale, 5 * scale);
    ctx.closePath();
    ctx.fill();

    // body
    const bg = ctx.createLinearGradient(-20 * scale, -12 * scale, 24 * scale, 12 * scale);
    bg.addColorStop(0, '#5d4126');
    bg.addColorStop(0.6, '#7d5732');
    bg.addColorStop(1, '#402c18');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, 0, 27 * scale, 14 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // wing shoulder
    ctx.fillStyle = 'rgba(255,240,215,.12)';
    ctx.beginPath();
    ctx.ellipse(2 * scale, -2 * scale, 15 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    ctx.ellipse(24 * scale, -3 * scale, 11 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,20,.4)';
    ctx.lineWidth = 1.2 * scale;
    ctx.stroke();

    // beak
    ctx.fillStyle = '#f7b32b';
    ctx.beginPath();
    ctx.moveTo(31 * scale, -5 * scale);
    ctx.lineTo(45 * scale, -1 * scale);
    ctx.lineTo(31 * scale, 4 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c07d10';
    ctx.lineWidth = 1 * scale;
    ctx.stroke();

    // eye + angry brow
    ctx.fillStyle = '#20180f';
    ctx.beginPath();
    ctx.arc(26 * scale, -6 * scale, 2.6 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b1f12';
    ctx.lineWidth = 2.4 * scale;
    ctx.beginPath();
    ctx.moveTo(19 * scale, -12 * scale);
    ctx.lineTo(31 * scale, -8 * scale);
    ctx.stroke();

    // talons (streamlined while diving)
    ctx.strokeStyle = '#f7b32b';
    ctx.lineWidth = 2.6 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(14 * scale, 10 * scale);
    ctx.lineTo(22 * scale, 15 * scale);
    ctx.moveTo(8 * scale, 11 * scale);
    ctx.lineTo(14 * scale, 17 * scale);
    ctx.stroke();

    ctx.restore();
  };

  /* ============================================================ ENV ART */

  const cloudCache = new Map();
function cloud(w, h, seed) {
    const key = w + 'x' + h + '_' + seed;
    if (cloudCache.has(key)) return cloudCache.get(key);
    const o = canvas(w, h);
    const ctx = o.ctx;
    const rand = mulberry32(seed * 7717 + 13);
    const blobs = 5 + Math.floor(rand() * 4);
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    for (let i = 0; i < blobs; i++) {
      const bx = w * (0.16 + rand() * 0.68);
      const by = h * (0.42 + rand() * 0.3);
      const br = h * (0.2 + rand() * 0.3);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    // flat bottom
    ctx.fillStyle = 'rgba(226,240,250,.9)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.78, w * 0.36, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    cloudCache.set(key, o.c);
    return o.c;
  };

  /** Rolling hill layer, tiled horizontally. */
  const hillCache = new Map();
function hills(w, h, color, top, seed, roughness) {
    const key = w + 'x' + h + '_' + color + '_' + seed;
    if (hillCache.has(key)) return hillCache.get(key);
    const o = canvas(w, h);
    const ctx = o.ctx;
    const rand = mulberry32(seed);
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, color);
    g.addColorStop(1, shade(color, -18));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const pts = [];
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const x = (w / steps) * i;
      const wave = Math.sin(i * 0.9 + seed) * 0.4 + Math.sin(i * 2.3 + seed * 1.7) * 0.22;
      const y = top + (0.55 + wave * 0.45) * (h - top) * roughness;
      pts.push([x, y]);
    }
    // smooth with quadratic midpoints
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(w, pts[pts.length - 1][1]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // little trees / bumps for texture
    ctx.fillStyle = shade(color, 10);
    for (let i = 0; i < 22; i++) {
      const x = rand() * w;
      const idx = Math.min(pts.length - 1, Math.floor((x / w) * steps));
      const y = pts[idx][1] + 4 + rand() * 10;
      const s = 4 + rand() * 9;
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    hillCache.set(key, o.c);
    return o.c;
  };

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt;
    let g = ((n >> 8) & 255) + amt;
    let b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  A.shade = shade;

  /** Floating island under a letter tower. */
function drawIsland(ctx, cx, topY, w, drop, seed) {
    const rand = mulberry32(seed);
    const h = drop;
    ctx.save();
    // grass cap
    const g = ctx.createLinearGradient(0, topY - 12, 0, topY + 16);
    g.addColorStop(0, '#8ad35a');
    g.addColorStop(0.5, '#63b23c');
    g.addColorStop(1, '#478a2b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, topY + 6);
    ctx.lineTo(cx - w / 2 + 6, topY - 8);
    ctx.lineTo(cx + w / 2 - 6, topY - 8);
    ctx.lineTo(cx + w / 2, topY + 6);
    ctx.closePath();
    ctx.fill();

    // dirt cone
    const dg = ctx.createLinearGradient(0, topY, 0, topY + h);
    dg.addColorStop(0, '#a97442');
    dg.addColorStop(0.6, '#84552d');
    dg.addColorStop(1, 'rgba(90,58,32,0)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + 3, topY + 4);
    ctx.quadraticCurveTo(cx - w * 0.28, topY + h * 0.72, cx - w * 0.06, topY + h);
    ctx.quadraticCurveTo(cx + w * 0.22, topY + h * 0.66, cx + w / 2 - 3, topY + 4);
    ctx.closePath();
    ctx.fill();

    // rocks + roots
    ctx.fillStyle = 'rgba(70,44,22,.35)';
    for (let i = 0; i < 5; i++) {
      const x = cx - w * 0.4 + rand() * w * 0.8;
      const y = topY + 10 + rand() * h * 0.5;
      const r = 3 + rand() * 6;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // hanging vines
    ctx.strokeStyle = 'rgba(90,150,60,.75)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const x = cx - w * 0.34 + rand() * w * 0.68;
      ctx.beginPath();
      ctx.moveTo(x, topY + 6);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * 14, topY + h * 0.6, x + (rand() - 0.5) * 10, topY + h * (0.6 + rand() * 0.3));
      ctx.stroke();
    }
    ctx.restore();
  };

  /** Swaying grass blade cluster. */
function grassTuft(ctx, x, y, w, t, phase, color) {
    ctx.save();
    ctx.strokeStyle = color || 'rgba(58,132,44,.9)';
    ctx.lineCap = 'round';
    const blades = 5;
    for (let i = 0; i < blades; i++) {
      const off = (i - (blades - 1) / 2) * (w / blades);
      const sway = Math.sin(t * 0.0016 + phase + i * 0.6) * w * 0.16;
      const bh = w * (0.5 + (i % 3) * 0.22);
      ctx.lineWidth = Math.max(1, w * 0.07);
      ctx.beginPath();
      ctx.moveTo(x + off, y);
      ctx.quadraticCurveTo(x + off + sway * 0.4, y - bh * 0.6, x + off + sway, y - bh);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ============================================================== ASSETS
     Optional drop-in sprites. Each one is auto-trimmed to its opaque bounds
     on load (reference PNGs are usually exported with wide transparent
     margins) and anything missing falls back to the procedural art.      */

  let fishImage = null;
  let fishBox = null;
  let eagleImage = null;
  let eagleBox = null;
  let bgImage = null;
  let eagleBaseW = 168;
  let eagleFlip = false;

  // Drop-in block textures + slingshot (all optional; procedural fallback).
  let woodImage = null;
  let woodBox = null;
  let stoneImage = null;
  let stoneBox = null;
  let glassImage = null;
  let glassBox = null;
  let tntImage = null;
  let tntBox = null;
  let slingImage = null;
  let slingBox = null;
  let pigImage = null;
  let pigBox = null;

  /** Force the procedural art (set from ?eagle=art / ?fish=art). */
  let forceArt = { fish: false, eagle: false };

function setForceArt(what, on) {
    if (what in forceArt) forceArt[what] = !!on;
  };

const hasBackground = function () {
    return !!bgImage;
  };
const background = function () {
    return bgImage;
  };

  /**
   * Find an image's opaque bounding box. Scans a downscaled copy (the reference
   * files are up to 1.5k px, scanning those directly is wasteful), then scales
   * the box back up. Returns null if the image is fully transparent / unreadable.
   */
  function trimBox(img, thresh) {
    const t = thresh == null ? 12 : thresh;
    const maxSide = 420;
    const s = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * s));
    const h = Math.max(1, Math.round(img.height * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    let d;
    try {
      g.drawImage(img, 0, 0, w, h);
      d = g.getImageData(0, 0, w, h).data;
    } catch {
      return null; // tainted canvas — just use the full image
    }
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (d[(row + x) * 4 + 3] > t) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const k = 1 / s;
    return {
      sx: Math.max(0, (x0 - 1) * k),
      sy: Math.max(0, (y0 - 1) * k),
      sw: Math.min(img.width, (x1 - x0 + 3) * k),
      sh: Math.min(img.height, (y1 - y0 + 3) * k)
    };
  }

  /** Draw a (trimmed) sprite centred on the current origin, `wid` across. */
  function drawCentered(ctx, img, box, wid) {
    const ar = box ? box.sh / box.sw : img.height / img.width;
    const hei = wid * ar;
    if (box) {
      ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, -wid / 2, -hei / 2, wid, hei);
    } else {
      ctx.drawImage(img, -wid / 2, -hei / 2, wid, hei);
    }
  }

  function loadSprite(url, label, done) {
    if (!url) return;
    const img = new Image();
    img.onload = function () {
      const box = trimBox(img);
      done(img, box);
      if (window.console) {
        console.info(
          '[CB2] using ' + label + ' art: ' + url +
          (box ? ' (trimmed to ' + Math.round(box.sw) + 'x' + Math.round(box.sh) + ')' : '')
        );
      }
    };
    img.onerror = function () {
      if (window.console) console.info('[CB2] no custom ' + label + ' art found, using the built-in art');
    };
    img.src = url;
  }

function loadAssets(cfg) {
    const A = cfg.assets || {};
    eagleBaseW = A.eagleWidth || 168;
    eagleFlip = !!A.eagleFlip;

    loadSprite(A.fish, 'sardine can', function (img, box) {
      fishImage = img;
      fishBox = box;
    });
    loadSprite(A.eagle, 'Mighty Eagle', function (img, box) {
      eagleImage = img;
      eagleBox = box;
    });
    loadSprite(A.wood, 'wood block', function (img, box) {
      woodImage = img;
      woodBox = box;
      texCache.clear(); // rebuild any block textures cached before the PNG loaded
    });
    loadSprite(A.stone, 'stone block', function (img, box) {
      stoneImage = img;
      stoneBox = box;
      texCache.clear();
    });
    loadSprite(A.glass, 'glass block', function (img, box) {
      glassImage = img;
      glassBox = box;
      texCache.clear();
    });
    loadSprite(A.tnt, 'TNT block', function (img, box) {
      tntImage = img;
      tntBox = box;
      texCache.clear();
    });
    loadSprite(A.slingshot, 'slingshot', function (img, box) {
      slingImage = img;
      slingBox = box;
    });
    loadSprite(A.pig, 'pig', function (img, box) {
      pigImage = img;
      pigBox = box;
    });

    const bg = A.background;
    if (bg) {
      const img = new Image();
      img.onload = function () {
        bgImage = img;
        if (window.console) console.info('[CB2] using background art: ' + bg);
      };
      img.onerror = function () {
        if (window.console) console.info('[CB2] no background art found, using the painted sky');
      };
      img.src = bg;
    }
  };

  /** Optional tower reference sheet overlay (?guides=1). */
function loadTowerGuide(cfg) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = cfg.assets.towerGuide;
    });
  };
function disposeAssets(){
  fishImage=null;fishBox=null;eagleImage=null;eagleBox=null;bgImage=null;woodImage=null;woodBox=null;stoneImage=null;stoneBox=null;glassImage=null;glassBox=null;tntImage=null;tntBox=null;slingImage=null;slingBox=null;pigImage=null;pigBox=null;fishFallback=null;texCache.clear();tintCache.clear();cloudCache.clear();hillCache.clear();
}


return { rng, block, drawFish, slingTips, drawSling, drawBands, drawPig, drawEagle, cloud, hills, drawIsland, grassTuft, setForceArt, hasBackground, background, loadAssets, loadTowerGuide, disposeAssets };
})();

const rng = art.rng;
const blockTexture = art.block;

/* ============================ game/structure.js ============================ */
const structure = (() => {
/* ==========================================================================
   Code Bounty 2.0 — structure.js
   --------------------------------------------------------------------------
   The hero sculpture, defined in "units" straight from the reference art
   (structure.png). Everything here is *layout only* — no canvas, no React — so
   both the game world (world.js) and a DOM preview can consume the same data.

     · every letter is a small building of wood / stone / glass blocks
     · diagonal arms and roofs are rotated beams
     · pigs are tucked into the hollows, TNT crates sit on top / at the base

   Coordinates use (0,0) at the top-left of a 74 x 42 layout, y pointing down.
   world.js converts these units to the game's pixel world.
   ========================================================================== */

const WORLD = { w: 70, h: 54 }; // size of the whole layout in units

const T = 2; // stroke thickness of letters (units)

/* ------------------------------------------------------------- helpers */

const box = (type, x, y, w, h) => ({ type, x, y, w, h, rot: 0 });

// beam between two points (for diagonals and roofs)
const beam = (type, x1, y1, x2, y2, t = T) => {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return {
    type,
    x: cx - len / 2,
    y: cy - t / 2,
    w: len,
    h: t,
    rot: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
  };
};

const frame = (type, x, y, w, h, t = T) => [
  box(type, x, y, t, h),
  box(type, x + w - t, y, t, h),
  box(type, x + t, y, w - 2 * t, t),
  box(type, x + t, y + h - t, w - 2 * t, t)
];

const roof = (x, y, w) => [
  beam('wood', x, y, x + w / 2, y - 4, 1.3),
  beam('wood', x + w, y, x + w / 2, y - 4, 1.3)
];

const legs = (x, y, a, b) => [box('stone', x + a, y, 1.6, 2.2), box('stone', x + b, y, 1.6, 2.2)];
const pig = (x, y, s = 3) => ({ x, y, s });
const tnt = (x, y, w = 3.2, h = 2.8) => ({ x, y, w, h });

/* ---------- letters: each returns { blocks, pigs, tnts } ---------- */

// ROW 1 ---------------------------------------------------------------
const letterC = (x, y) => {
  const W = 10, H = 10;
  return {
    blocks: [
      box('wood', x, y, T, H), // left bar
      box('glass', x - 1.2, y + 1.5, 1.2, H - 3.5), // glass strip, left edge
      box('stone', x + T, y, 5, T), // top stone
      box('wood', x + 7, y, 3, T), // top wood
      box('wood', x + W - T, y + T, T, 1.5), // little hanging nub
      box('wood', x + T, y + H - T, 6, T), // bottom bar
      box('glass', x + 8, y + H - 2.5, 2.5, 2.5), // glass cube bottom-right
      box('stone', x + 3.5, y + H, 2, 2.2), // leg
      ...roof(x + 1, y, 8)
    ],
    pigs: [pig(x + 3.3, y + H - T - 3)],
    tnts: []
  };
};

const letterO1 = (x, y) => {
  const W = 10, H = 10;
  return {
    blocks: [
      ...frame('wood', x, y, W, H),
      box('stone', x + T, y + H - T, 2, T),
      box('stone', x + W - T - 2, y + H - T, 2, T),
      ...legs(x, y + H, 2, 7),
      ...roof(x + 1, y, W - 2)
    ],
    pigs: [pig(x + W / 2 - 1.5, y + H - T - 3)],
    tnts: []
  };
};

const letterD = (x, y) => {
  const W = 10, H = 10;
  return {
    blocks: [
      box('glass', x + T, y + T, W - 2 * T, H - 2 * T), // big glass panel
      box('wood', x, y, T, H), // left bar
      box('wood', x + T, y, 4, T), // top wood
      box('stone', x + 6, y, W - 6, T), // top stone
      box('stone', x + W - T, y + T, T, H - T), // right stone curve
      box('stone', x + W - T - 1, y + H - T - 1, 1.2, 1.2), // rounded corner
      box('wood', x + T, y + H - T, W - 2 * T, T), // bottom
      ...legs(x, y + H, 1.5, 6)
    ],
    pigs: [pig(x + W / 2 - 1.5, y + H - T - 3), pig(x + W / 2 - 1.5, y - 2.8)], // inside + on top
    tnts: []
  };
};

const letterE = (x, y) => {
  const W = 9.5, H = 10;
  return {
    blocks: [
      box('wood', x, y, T, H), // spine
      box('wood', x + T, y + 1, W - T - 2.5, T), // top arm
      box('wood', x + T, y + 4.2, W - T - 3, T), // middle arm
      box('stone', x + W - 2.5, y + 2, 2.5, 2.2), // stone right
      box('glass', x + W - 1.6, y, 1.6, 1.6), // small glass top-right
      box('stone', x + T, y + H - T - 1.2, W - T - 1, 1.2), // stone row
      box('wood', x, y + H - T, W, T), // base
      ...legs(x, y + H, 1, W - 2.6),
      ...roof(x + 1, y + 0.5, W - 2)
    ],
    pigs: [pig(x + W - 4.8, y + H - T - 4.2)],
    tnts: []
  };
};

// ROW 2 ---------------------------------------------------------------
const letterB = (x, y) => {
  const W = 10, H = 12; // taller than before -> the two counters can open up
  return {
    blocks: [
      box('glass', x + 2.3, y + 2.4, 3, 1.9), // small glass pane inside the top counter
      box('wood', x, y, T, H), // spine
      box('wood', x + T, y, W - T - 1, T), // top bar
      box('wood', x + T, y + 5.4, W - T - 1, T), // middle bar (lower -> bigger counters)
      box('wood', x, y + H - T, W, T), // bottom bar
      box('stone', x + W - 2.6, y + T, 2.6, 3.4), // upper-right stroke
      box('wood', x + W - 2.4, y + 7.4, 2.4, 2.6), // lower-right stroke
      box('stone', x - 0.8, y + 8.6, 2.8, 1.8) // stone bottom-left
    ],
    pigs: [pig(x + 2.4, y + 2.3, 2.6), pig(x + 2.4, y + 7.8, 2.6)],
    tnts: [tnt(x + 0.2, y - 2.8, 3.2, 2.8)]
  };
};

const letterO2 = (x, y) => {
  const W = 8.6, H = 10.5;
  return {
    blocks: [
      box('stone', x, y, W, 1.8), // stone top
      box('wood', x, y + 1.8, T, H - 1.8),
      box('wood', x + W - T, y + 1.8, T, H - 1.8),
      box('wood', x + T, y + H - T, W - 2 * T, T),
      box('stone', x + W - T - 1.3, y + H - 2.4, 1.5, 1.5),
      ...roof(x + 1, y, W - 2)
    ],
    pigs: [pig(x + W / 2 - 1.4, y + H - T - 2.8, 2.8)],
    tnts: []
  };
};

const letterU = (x, y) => {
  const W = 8, H = 10.5;
  return {
    blocks: [
      box('wood', x, y, 2, H - 1.6), // left bar
      box('stone', x + W - 2, y, 2, 2.4), // stone cap, right
      box('wood', x + W - 2, y + 2.4, 2, H - 4), // right bar
      box('stone', x + 2, y + H - 3.2, W - 4, 1.6), // stone row
      box('wood', x, y + H - 1.6, W + 2.2, 1.6) // base (shared with N)
    ],
    pigs: [pig(x + 2.6, y + 4.3, 2.8)],
    tnts: []
  };
};

const letterN = (x, y) => {
  const W = 9, H = 10.5;
  return {
    blocks: [
      box('glass', x + 2, y + 0.3, W - 4, H - 1), // glass behind diagonal
      box('wood', x, y, 2, H),
      box('stone', x + W - 2, y, 2, 3.2),
      box('wood', x + W - 2, y + 3.2, 2, H - 3.2),
      beam('wood', x + 1.2, y + 0.8, x + W - 1.2, y + H - 1, 1.8) // diagonal
    ],
    pigs: [],
    tnts: []
  };
};

const letterT = (x, y) => {
  const W = 7.3;
  return {
    blocks: [
      box('wood', x, y + 1.6, W, 2.2), // crossbar
      box('stone', x + W - 2, y + 0.2, 1.5, 1.4), // small stones on bar
      box('wood', x + 2.2, y + 3.8, 2.6, 2.6), // stem
      box('stone', x + 2.2, y + 6.4, 2.6, 1.6), // stone block
      box('wood', x + 1, y + 8, 5, 2.4) // base
    ],
    pigs: [],
    tnts: [tnt(x + 0.5, y - 1.4, 3, 3)]
  };
};

const letterY = (x, y) => {
  const W = 10;
  return {
    blocks: [
      beam('wood', x + 1.2, y + 1.6, x + W / 2, y + 5.6, 2.2), // left arm
      beam('wood', x + W - 1.2, y + 1.6, x + W / 2, y + 5.6, 2.2), // right arm
      box('glass', x + 3.7, y + 6, 2.6, 2.6), // glass cube
      box('stone', x + 2.2, y + 8.6, 4.4, 3.2) // stone base
    ],
    pigs: [pig(x + 3.7, y + 1.6, 2.6)],
    tnts: [tnt(x + 2.3, y - 1.9, 4.1, 2.8), tnt(x + 6.6, y + 8.5, 3.4, 3.4)]
  };
};

// ROW 3 ---------------------------------------------------------------
const letter2 = (x, y) => {
  const W = 10.9, H = 9.7;
  return {
    blocks: [
      box('wood', x + 2.5, y + 0.4, 6, T), // top bar
      box('stone', x + 7.4, y + 0.4, 2.8, 3), // stone cap
      beam('wood', x + 9, y + 3.5, x + 1.2, y + H - 2.4, 2.2), // diagonal
      box('stone', x, y + H - 1.8, 3, 1.8), // stone bottom-left
      box('wood', x + 3, y + H - 1.8, W - 3, 1.8) // bottom bar
    ],
    pigs: [pig(x + 4, y + H - 1.8 - 2.6, 2.6)],
    tnts: []
  };
};

const letterDot = (x, y) => ({
  blocks: [box('stone', x, y, 2.3, 2.1)],
  pigs: [],
  tnts: []
});

const letter0 = (x, y) => {
  const W = 9.2, H = 9.7;
  return {
    blocks: [
      box('stone', x, y, W, 1.6), // stone cap
      box('wood', x, y + 1.6, T, H - 1.6),
      box('wood', x + W - T, y + 1.6, T, H - 1.6),
      box('wood', x + T, y + H - T, W - 2 * T, T)
    ],
    pigs: [pig(x + W / 2 - 1.6, y + H - T - 3.2, 3.2)],
    tnts: []
  };
};

/* ---------- layout: each letter's top-left position (units) ----------
   The three words are spaced well apart vertically (CODE / BOUNTY / 2.0) and
   `buildGroups()` also spreads each row's letters horizontally, so the whole
   sculpture reads as clearly separated letters instead of one dense mass. */
const PLACEMENT = [
  // row 0 (top): C O D E
  { fn: letterC, x: 16, y: 6, row: 0, name: 'C' },
  { fn: letterO1, x: 27.4, y: 6, row: 0, name: 'O' },
  { fn: letterD, x: 39.5, y: 6, row: 0, name: 'D' },
  { fn: letterE, x: 51.8, y: 6, row: 0, name: 'E' },
  // row 1 (middle): B O U N T Y
  { fn: letterB, x: 11.6, y: 23.5, row: 1, name: 'B' },
  { fn: letterO2, x: 22.3, y: 23.5, row: 1, name: 'O' },
  { fn: letterU, x: 31.8, y: 23.5, row: 1, name: 'U' },
  { fn: letterN, x: 40.5, y: 23.5, row: 1, name: 'N' },
  { fn: letterT, x: 49.5, y: 23.5, row: 1, name: 'T' },
  { fn: letterY, x: 56.8, y: 23.5, row: 1, name: 'Y' },
  // row 2 (bottom): 2 . 0
  { fn: letter2, x: 26.6, y: 38, row: 2, name: '2' },
  { fn: letterDot, x: 35.2, y: 44.5, row: 2, name: '.' },
  { fn: letter0, x: 38.4, y: 38, row: 2, name: '0' }
];

/* Horizontal spread applied per word: each letter is pushed away from its
   row's centre, so the gaps *between* letters grow while the letters them-
   selves stay the same size. */
const X_SPREAD = 1.16;

/** Spread one row's letters horizontally around that row's centre. */
function spreadRow(groups) {
  let min = Infinity;
  let max = -Infinity;
  const visit = (fn) => (o) => {
    const w = o.w !== undefined ? o.w : o.s;
    fn(o, w);
  };
  groups.forEach((g) => {
    [...g.blocks, ...g.tnts, ...g.pigs].forEach(visit((o, w) => {
      min = Math.min(min, o.x);
      max = Math.max(max, o.x + w);
    }));
  });
  const c = (min + max) / 2;
  groups.forEach((g) => {
    [...g.blocks, ...g.tnts, ...g.pigs].forEach(visit((o, w) => {
      o.x += (o.x + w / 2 - c) * (X_SPREAD - 1);
    }));
  });
}

/**
 * Build the sculpture letter by letter (i.e. one group per hero letter).
 * Each group = { index, row, name, blocks, pigs, tnts } in units.
 */
function buildGroups() {
  const groups = PLACEMENT.map((p, i) => {
    const part = p.fn(p.x, p.y);
    return { index: i, row: p.row, name: p.name, ...part };
  });
  // widen the gaps between the letters of each word
  const rows = [...new Set(groups.map((g) => g.row))];
  rows.forEach((row) => spreadRow(groups.filter((g) => g.row === row)));
  return groups;
}

/** Flat version of the whole sculpture, handy for previews/tools. */
const STRUCTURE = (() => {
  const out = { blocks: [], pigs: [], tnts: [] };
  buildGroups().forEach((g) => {
    out.blocks.push(...g.blocks);
    out.pigs.push(...g.pigs);
    out.tnts.push(...g.tnts);
  });
  return out;
})();

STRUCTURE;


return { WORLD, STRUCTURE, buildGroups };
})();

const buildGroups = structure.buildGroups;

/* ============================ game/physics.js ============================ */
const P = (() => {
/* ==========================================================================
   Code Bounty 2.0 — physics.js
   --------------------------------------------------------------------------
   Matter.js world: static block towers that turn into dynamic debris the
   moment they are hit, TNT crates that detonate, pigs that pop in smoke.

   Design note: the letter towers are *static until struck*. That keeps the
   structures perfectly stable (no solver jitter on stacked blocks) while
   still giving full physics to every piece of debris afterwards.
   ========================================================================== */


const { Engine, Bodies, Body, Composite, Events } = Matter;

const GRAV_SCALE = 0.001;
const BASE_DELTA = 1000 / 60;
const DENSITY = { wood: 0.0016, stone: 0.0032, glass: 0.0011, tnt: 0.0018 };

let engine = null;
let level = null;
let cfg = null;
let hooks = {};

const blocks = [];
const pigs = [];
const debris = [];
let projectile = null;
let stats = { total: 0, destroyed: 0 };
let settled = true;

/** px per step^2 that Matter applies for the configured gravity. */
let gPx = 0;

function computeGravity() {
  gPx = cfg.physics.gravity.y * GRAV_SCALE * BASE_DELTA * BASE_DELTA;
}

/* ------------------------------------------------------------------ init */

function init(config, builtLevel, callbacks) {
  cfg = config;
  level = builtLevel;
  hooks = callbacks || {};
  computeGravity();

  engine = Engine.create({ enableSleeping: true });
  engine.gravity.x = cfg.physics.gravity.x;
  engine.gravity.y = cfg.physics.gravity.y;
  engine.gravity.scale = GRAV_SCALE;
  engine.positionIterations = 8;
  engine.velocityIterations = 6;

  buildStatics();

  Events.on(engine, 'collisionStart', onCollision);
  Events.on(engine, 'collisionActive', () => {
    settled = false;
  });

  projectile = null;
  stats = { total: blocks.length, destroyed: 0 };
  settled = true;
}

function buildStatics() {
  const groundY = level.groundY;

  // ground + side walls so nothing escapes the level
  const ground = Bodies.rectangle(cfg.world.w / 2, groundY + 80, cfg.world.w * 3, 160, {
    isStatic: true,
    friction: 0.9,
    restitution: 0.02,
    label: 'ground'
  });
  Composite.add(engine.world, ground);

  // island tops: debris piles up on the floating islands
  level.islands.forEach((isl) => {
    const b = Bodies.rectangle(isl.cx, isl.topY + 12, isl.w, 24, {
      isStatic: true,
      friction: 0.95,
      restitution: 0.02,
      label: 'island'
    });
    b.plugin.cb2 = { kind: 'island' };
    Composite.add(engine.world, b);
  });

  // letter towers
  blocks.length = 0;
  level.towers.forEach((tower) => {
    tower.blocks.forEach((spec) => {
      /*
        NOTE: bodies are created *dynamic* and frozen afterwards with
        setStatic(true). Matter only captures the mass/inertia needed to wake a
        body up if setStatic() transitions a non-static body, so passing
        `isStatic: true` into the constructor would leave the block with
        infinite mass forever once the tower is smashed.
      */
      const body = Bodies.rectangle(spec.x, spec.y, spec.w, spec.h, {
        friction: 0.62,
        frictionStatic: 0.9,
        restitution: 0.06,
        label: 'block',
        angle: spec.rot || 0, // diagonal arms / roofs
        density: DENSITY[spec.mat] || 0.0016
      });
      Body.setStatic(body, true);
      body.plugin.cb2 = {
        kind: 'block',
        mat: spec.mat,
        letter: spec.letter,
        letterIndex: spec.letterIndex,
        w: spec.w,
        h: spec.h,
        alive: true,
        tex: blockTexture(spec.mat, spec.w, spec.h)
      };
      blocks.push(body);
      Composite.add(engine.world, body);
    });

    // pigs inside the letters
    tower.pigs.forEach((p) => addPig(p.x, p.y, p.r));
  });

  level.groundPigs.forEach((p) => addPig(p.x, p.y, p.r));
}

function addPig(x, y, r) {
  const body = Bodies.circle(x, y, r, { label: 'pig', density: 0.0012 });
  Body.setStatic(body, true);
  body.plugin.cb2 = { kind: 'pig', r, alive: true, phase: Math.random() * 6.28, pop: 0 };
  pigs.push(body);
  Composite.add(engine.world, body);
  return body;
}

function reset() {
  if (!engine) return;
  pigs.forEach((p) => Composite.remove(engine.world, p));
  pigs.length = 0;
  Composite.allBodies(engine.world).forEach((b) => Composite.remove(engine.world, b));
  blocks.length = 0;
  debris.length = 0;
  projectile = null;
  buildStatics();
  stats = { total: blocks.length, destroyed: 0 };
  settled = true;
}

/* ----------------------------------------------------------- projectile */

function launch(x, y, vx, vy) {
  const r = cfg.sling.radius;
  const body = Bodies.circle(x, y, r, {
    restitution: 0.34,
    friction: 0.04,
    frictionAir: cfg.physics.frictionAir,
    density: 0.0022,
    label: 'can'
  });
  body.plugin.cb2 = { kind: 'can', r, alive: true, hit: false, born: performance.now() };
  Body.setVelocity(body, { x: vx, y: vy });
  Body.setAngularVelocity(body, vx * 0.012);
  Composite.add(engine.world, body);
  projectile = body;
  settled = false;
  return body;
}

function removeProjectile() {
  if (projectile) {
    Composite.remove(engine.world, projectile);
    projectile = null;
  }
}

/* --------------------------------------------------------- destruction */

function impactSpeed(body) {
  return Math.hypot(body.velocity.x, body.velocity.y);
}

/**
 * Turn a block into flying debris.
 * @param {object} body  Matter body with plugin.cb2
 * @param {object} vel   {x,y} initial velocity
 * @param {number} spin  angular velocity
 */
function shatter(body, vel, spin) {
  const meta = body.plugin && body.plugin.cb2;
  if (!meta || !meta.alive || meta.kind !== 'block') return false;

  meta.alive = false;
  meta.kind = 'debris';
  Body.setStatic(body, false);
  Body.setDensity(body, DENSITY[meta.mat] || 0.0016);
  Body.setVelocity(body, vel || { x: 0, y: 0 });
  Body.setAngularVelocity(body, spin || (Math.random() - 0.5) * 0.3);

  debris.push({ body, mat: meta.mat, tex: meta.tex, w: meta.w, h: meta.h, age: 0, fade: 1 });
  stats = { ...stats, destroyed: stats.destroyed + 1 };

  if (hooks.onBlockDestroyed) hooks.onBlockDestroyed(body, meta);
  if (meta.mat === 'tnt') explode(body.position.x, body.position.y, 132, 0.34);
  return true;
}

/** Radial blast: shatters everything in range and throws it outward. */
function explode(x, y, radius, power) {
  blocks.forEach((body) => {
    const meta = body.plugin.cb2;
    if (!meta.alive) return;
    const dx = body.position.x - x;
    const dy = body.position.y - y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > radius + Math.max(meta.w, meta.h)) return;
    const fall = Math.max(0, 1 - d / (radius * 1.25));
    const mag = (power * 18 * fall + 2.5 * fall) * (meta.mat === 'stone' ? 0.6 : 1);
    shatter(
      body,
      {
        x: (dx / d) * mag + (Math.random() - 0.5) * 2,
        y: (dy / d) * mag - Math.abs(fall) * 1.6
      },
      (Math.random() - 0.5) * 0.5 * fall
    );
  });

  // knock loose debris around too
  debris.forEach((d) => {
    const b = d.body;
    const dx = b.position.x - x;
    const dy = b.position.y - y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > radius * 1.4) return;
    const fall = Math.max(0, 1 - dist / (radius * 1.4));
    Body.applyForce(b, b.position, {
      x: (dx / dist) * b.mass * 0.012 * fall,
      y: (dy / dist) * b.mass * 0.012 * fall - b.mass * 0.004 * fall
    });
  });

  popPigsNear(x, y, radius * 1.15);
  if (hooks.onExplosion) hooks.onExplosion(x, y, radius);
}

/** Eagle sweep / shockwave: everything inside the radius is obliterated. */
function sweep(x, y, radius, dirX, dirY, force) {
  blocks.forEach((body) => {
    const meta = body.plugin.cb2;
    if (!meta.alive) return;
    const dx = body.position.x - x;
    const dy = body.position.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = radius + Math.max(meta.w, meta.h) * 0.5;
    if (d > reach) return;
    const fall = Math.max(0.25, 1 - d / (radius * 1.3));
    shatter(
      body,
      {
        x: dirX * force * fall + (dx / d) * force * 0.5 * fall + (Math.random() - 0.5) * 3,
        y: dirY * force * fall + (dy / d) * force * 0.6 * fall - 1.5 * fall
      },
      (Math.random() - 0.5) * 0.7 * fall
    );
  });
  popPigsNear(x, y, radius * 1.2);
}

function popPigsNear(x, y, radius) {
  pigs.forEach((pig) => {
    const meta = pig.plugin.cb2;
    if (!meta.alive) return;
    const d = Math.hypot(pig.position.x - x, pig.position.y - y);
    if (d > radius + meta.r) return;
    popPig(pig);
  });
}

function popPig(pig) {
  const meta = pig.plugin && pig.plugin.cb2;
  if (!meta || !meta.alive) return;
  meta.alive = false;
  meta.pop = performance.now();
  Composite.remove(engine.world, pig);
  const i = pigs.indexOf(pig);
  if (i >= 0) pigs.splice(i, 1);
  if (hooks.onPigPop) hooks.onPigPop(pig.position.x, pig.position.y, meta.r);
}

/* -------------------------------------------------------------- events */

function onCollision(evt) {
  for (const pair of evt.pairs) {
    const a = pair.bodyA;
    const b = pair.bodyB;
    const aMeta = a.plugin.cb2;
    const bMeta = b.plugin.cb2;
    const aCan = aMeta && aMeta.kind === 'can';
    const bCan = bMeta && bMeta.kind === 'can';

    if (aCan || bCan) {
      const can = aCan ? a : b;
      const other = aCan ? b : a;
      const speed = impactSpeed(can);
      if (speed < cfg.physics.impactSpeed) continue;

      const oMeta = other.plugin.cb2;
      const cx = (can.position.x + other.position.x) / 2;
      const cy = (can.position.y + other.position.y) / 2;
      const nx = can.velocity.x;
      const ny = can.velocity.y;

      if (oMeta && oMeta.kind === 'block') {
        const vx = nx * 0.62 + (Math.random() - 0.5) * 4;
        const vy = ny * 0.42 - 2.2 - Math.random() * 2;
        shatter(other, { x: vx, y: vy }, (Math.random() - 0.5) * 0.45);
        // splash damage to the neighbourhood
        blocks.forEach((body) => {
          const meta = body.plugin.cb2;
          if (!meta.alive || body === other) return;
          const d = Math.hypot(body.position.x - cx, body.position.y - cy);
          if (d > 86) return;
          const fall = 1 - d / 86;
          if (Math.random() > fall * 1.15) return;
          shatter(
            body,
            {
              x: nx * 0.3 * fall + ((body.position.x - cx) / (d || 1)) * 3 * fall,
              y: ny * 0.22 * fall - 3 * fall
            },
            (Math.random() - 0.5) * 0.4
          );
        });
      } else if (oMeta && oMeta.kind === 'pig') {
        popPig(other);
      } else if (!oMeta || oMeta.kind !== 'debris') {
        // hit the ground or an island: small dust kick
        if (hooks.onThud) hooks.onThud(cx, cy, Math.min(1, speed / 18));
      }

      const meta = can.plugin.cb2;
      if (meta) meta.hit = true;
      // the can loses most of its punch
      Body.setVelocity(can, { x: nx * 0.45, y: ny * 0.4 - 1 });
      if (hooks.onImpact) hooks.onImpact(cx, cy, speed, meta && meta.hit && stats.destroyed > 0);
    } else if (hooks.onDebrisHit) {
      hooks.onDebrisHit(aMeta && aMeta.mat, bMeta && bMeta.mat);
    }
  }
}

/* ---------------------------------------------------------------- step */

// Fixed 1/60 s simulation steps, fed by real frame time so the physics runs at
// the same speed on 60 Hz and 120 Hz displays alike. This is what makes the
// solved flight time ("touches the tower after exactly 3 s") hold everywhere.
let acc = 0;

function step(dt) {
  if (!engine) return;
  const real = typeof dt === 'number' && dt > 0 ? dt : BASE_DELTA;
  acc += real;

  let n = 0;
  while (acc >= BASE_DELTA && n < 5) {
    Engine.update(engine, BASE_DELTA);
    acc -= BASE_DELTA;
    n++;

    // cleanup + bookkeeping
    debris.forEach((d) => {
      d.age++;
      if (d.age > 240) d.fade = Math.max(0, 1 - (d.age - 240) / 90);
    });
    for (let i = debris.length - 1; i >= 0; i--) {
      const b = debris[i].body;
      if (b.position.y > cfg.world.h + 600 || b.position.x < -cfg.world.w) {
        Composite.remove(engine.world, b);
        debris.splice(i, 1);
      }
    }
    // performance guard
    while (debris.length > cfg.physics.maxDebris) {
      const old = debris.shift();
      Composite.remove(engine.world, old.body);
    }
  }

  // drop any backlog after a long stall so we never spiral
  if (acc > BASE_DELTA * 5) acc = 0;
}

function setTimeScale(s) {
  if (engine) engine.timing.timeScale = s;
}

function isSettled() {
  if (!engine) return true;
  for (const b of Composite.allBodies(engine.world)) {
    if (b.isStatic) continue;
    if (b.speed > 0.6 || b.angularSpeed > 0.06) return false;
  }
  return true;
}

/** Tear the Matter world down completely (React unmount). */
function dispose() {
  if (!engine) return;
  Events.off(engine, 'collisionStart', onCollision);
  Composite.clear(engine.world, false);
  Engine.clear(engine);
  engine = null;
  blocks.length = 0;
  pigs.length = 0;
  debris.length = 0;
  projectile = null;
}

/**
 * Forward-integrate the *exact* path a launched body will take.
 *
 * Mirrors Matter's `Body.update`: Verlet (position advances by the new
 * velocity) plus linear air drag, with gravity folded in as a per-step
 * acceleration. The slingshot's dotted preview and the auto-play aim solver
 * both run on this, so the preview really is what you get.
 *
 * @param {{x:number,y:number}} origin world position the body starts from
 * @param {{x:number,y:number}} v      initial velocity in px/step
 * @param {number} steps  how many frames to simulate
 * @param {number} [dt]   ms per step — pass the engine's time-scaled delta
 */
function ballistic(origin, v, steps, dt) {
  const d = dt || BASE_DELTA;
  const k = 1 - cfg.physics.frictionAir * (d / BASE_DELTA);
  const ax = cfg.physics.gravity.x * GRAV_SCALE * d * d;
  const ay = cfg.physics.gravity.y * GRAV_SCALE * d * d;
  let x = origin.x;
  let y = origin.y;
  let vx = v.x;
  let vy = v.y;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    vx = vx * k + ax;
    vy = vy * k + ay;
    x += vx;
    y += vy;
    if (y > cfg.world.groundY + 40) break;
    pts.push({ x, y });
  }
  return pts;
}

/**
 * Solve the launch velocity that carries a projectile from `origin` to
 * `target` in exactly `steps` fixed steps, using the same integrator as
 * `ballistic` (Verlet + linear air drag + gravity).
 *
 * The integrator is affine in the initial velocity, and drag/gravity only
 * couple within each axis, so the closed form is exact for the discrete sim:
 *
 *   p_n = p0 + v0 * S + a / (1 - k) * (n - S),
 *   S   = sum_{i=1..n} k^i
 *
 * @param {{x:number,y:number}} origin
 * @param {{x:number,y:number}} target   where it should be after `steps`
 * @param {number} steps                 number of fixed 1/60 s steps
 * @returns {{x:number,y:number}} initial velocity in px/step
 */
function velocityFor(origin, target, steps) {
  const d = BASE_DELTA;
  const k = 1 - cfg.physics.frictionAir * (d / BASE_DELTA);
  const n = Math.max(1, steps);
  const S = k === 1 ? n : (k * (1 - Math.pow(k, n))) / (1 - k); // sum k^i
  const ax = cfg.physics.gravity.x * GRAV_SCALE * d * d;
  const ay = cfg.physics.gravity.y * GRAV_SCALE * d * d;
  // gravity accumulation term, lim (n - S)/(1 - k) -> n(n+1)/2 as k -> 1
  const fall = k === 1 ? (n * (n + 1)) / 2 : (n - S) / (1 - k);
  return {
    x: (target.x - origin.x - ax * fall) / S,
    y: (target.y - origin.y - ay * fall) / S
  };
}


return { blocks, pigs, debris, get projectile() { return projectile; }, get stats() { return stats; }, get settled() { return settled; }, get gPx() { return gPx; }, init, reset, launch, removeProjectile, shatter, explode, sweep, popPig, step, setTimeScale, isSettled, dispose, ballistic, velocityFor };
})();


/* ============================ game/world.js ============================ */
const world = (() => {
/* ==========================================================================
   Code Bounty 2.0 — world.js
   --------------------------------------------------------------------------
   Builds the level: the hero sculpture (CODE / BOUNTY / 2.0) plus the painted
   background layers.

   The sculpture itself lives in structure.js, defined in "units" straight from
   the reference art. Here we scale those units into the pixel world, centre
   the whole thing on `towers.centerX` and drop it onto the grass at
   `world.groundY`.

   Because physics.js freezes every block until it is struck, the rows stack
   without any solver jitter.
   ========================================================================== */


/** Scale a unit rect (top-left origin) into the pixel world (centre origin). */
function mapper(unit, centerU, bottomU, cxWorld, groundY) {
  return {
    box: (b) => {
      const w = Math.max(3, b.w * unit);
      const h = Math.max(3, b.h * unit);
      return {
        x: cxWorld + (b.x + b.w / 2 - centerU) * unit,
        y: groundY - (bottomU - (b.y + b.h / 2)) * unit,
        w,
        h,
        rot: ((b.rot || 0) * Math.PI) / 180,
        mat: b.type
      };
    },
    pig: (p) => ({
      x: cxWorld + (p.x + p.s / 2 - centerU) * unit,
      y: groundY - (bottomU - (p.y + p.s / 2)) * unit,
      r: (p.s / 2) * unit
    })
  };
}

function build(cfg) {
  const rand = rng(cfg.world.seed);
  const t = cfg.towers;
  const unit = t.unit || 18;
  const groundY = cfg.world.groundY;
  const cxWorld = t.centerX;

  /* ------------------------------------------------------ hero sculpture */
  const groups = buildGroups();

  // Overall bounds of the sculpture in units (used to centre + ground it).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (x, y, w, h) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };
  groups.forEach((g) => {
    g.blocks.forEach((b) => visit(b.x, b.y, b.w, b.h));
    g.tnts.forEach((b) => visit(b.x, b.y, b.w, b.h));
    g.pigs.forEach((p) => visit(p.x, p.y, p.s, p.s));
  });
  const centerU = (minX + maxX) / 2;
  const bottomU = maxY;
  const map = mapper(unit, centerU, bottomU, cxWorld, groundY);

  const towers = groups.map((g) => {
    const blocks = [];
    g.blocks.forEach((b) => blocks.push({ ...map.box(b), letter: g.name, letterIndex: g.index }));
    g.tnts.forEach((b) => blocks.push({ ...map.box({ ...b, type: 'tnt', rot: 0 }), letter: g.name, letterIndex: g.index }));
    const pigs = g.pigs.map(map.pig);

    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const grow = (x, y, w, h) => {
      x0 = Math.min(x0, x - w / 2);
      x1 = Math.max(x1, x + w / 2);
      y0 = Math.min(y0, y - h / 2);
      y1 = Math.max(y1, y + h / 2);
    };
    blocks.forEach((b) => grow(b.x, b.y, b.w, b.h));
    pigs.forEach((p) => grow(p.x, p.y, p.r * 2, p.r * 2));

    const w = x1 - x0;
    const h = y1 - y0;
    const cx = (x0 + x1) / 2;
    return {
      char: g.name,
      row: g.row,
      index: g.index,
      x: x0,
      y: y0,
      w,
      h,
      cx,
      baselineY: y1,
      blocks,
      pigs,
      island: { cx, topY: y1, w: w + unit * 2, drop: 0 }
    };
  });

  /* ---------------------------------------------------------- background */
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const layer = i % 3; // 0 far, 2 near
    clouds.push({
      x: -200 + rand() * (cfg.world.w + 700),
      y: 40 + rand() * 380 - layer * 20,
      w: 150 + rand() * 190 + layer * 90,
      h: 60 + rand() * 60 + layer * 26,
      layer,
      speed: 0.012 + layer * 0.016,
      seed: 100 + i
    });
  }

  const hills = [
    { y: 640, h: 220, color: '#8fc9ea', parallax: 0.16, seed: 3, w: 1400, rough: 0.55 },
    { y: 700, h: 220, color: '#7ab6d8', parallax: 0.28, seed: 8, w: 1200, rough: 0.6 },
    { y: 762, h: 220, color: '#6aa6c4', parallax: 0.44, seed: 15, w: 1000, rough: 0.62 }
  ];

  // scattered scenery behind the towers: planks, crates, stones
  const props = [];
  for (let i = 0; i < 26; i++) {
    props.push({
      x: 60 + rand() * (cfg.world.w - 120),
      y: groundY - 4 - rand() * 8,
      w: 26 + rand() * 60,
      h: 12 + rand() * 22,
      mat: rand() > 0.55 ? 'wood' : 'stone',
      rot: (rand() - 0.5) * 0.25,
      far: rand() > 0.5
    });
  }

  const grass = [];
  for (let i = 0; i < 90; i++) {
    grass.push({
      x: -100 + rand() * (cfg.world.w + 200),
      w: 16 + rand() * 20,
      phase: rand() * Math.PI * 2
    });
  }

  const motes = [];
  for (let i = 0; i < 46; i++) {
    motes.push({
      x: rand() * cfg.world.w,
      y: 120 + rand() * (cfg.world.groundY - 160),
      r: 1.2 + rand() * 3.2,
      sp: 6 + rand() * 16,
      ph: rand() * Math.PI * 2,
      a: 0.12 + rand() * 0.24
    });
  }

  /* No floating islands: the sculpture stands on the ground on its own. */
  const islands = [];
  const groundPigs = [];

  return {
    towers,
    islands,
    groundPigs,
    clouds,
    hills,
    props,
    grass,
    motes,
    groundY: cfg.world.groundY,
    wordWidth: (maxX - minX) * unit
  };
}


return { build };
})();

const build = world.build;

/* ============================ game/render.js ============================ */
const render = (() => {
/* ==========================================================================
   Code Bounty 2.0 — render.js
   --------------------------------------------------------------------------
   Canvas view: parallax environment, physics bodies, slingshot, sardine can,
   trajectory preview, mighty eagle and particles. The old reveal "curtain"
   wordmark that sat behind the towers has been removed.

   `sling` and `eagle` are handed to init() rather than imported, which keeps
   this module free of circular imports (both of them need things from here).
   ========================================================================== */


let cv = null;
let ctx = null;
let cfg = null;
let level = null;
let sling = null;
let eagle = null;
let dpr = 1;
let vw = 0;
let vh = 0;
let baseScale = 1;
let towerGuide = null;

let reduced = false;
let showGuides = false;

/* ------------------------------------------------------------- camera */
const cam = {
  x: 0,
  y: 0,
  zoom: 1,
  tx: 0,
  ty: 0,
  tzoom: 1,
  shake: 0,
  sx: 0,
  sy: 0,
  srot: 0
};

const view = { scale: 1, ox: 0, oy: 0, mode: 'wide', baseScale: 1 };
const toWorld = (sx, sy) => ({ x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale });
const toScreen = (wx, wy) => ({ x: wx * view.scale + view.ox, y: wy * view.scale + view.oy });

/* ---------------------------------------------------------- particles
   The pool is a hard ring buffer: when it is full the oldest particle is
   dropped rather than growing without bound. `q()` scales burst sizes down as
   the pool fills so a 150-block collapse stays smooth.               */
const particles = [];

function maxParticles() {
  return (cfg && cfg.render && cfg.render.maxParticles) || 600;
}

function push(p) {
  const max = maxParticles();
  if (particles.length >= max) particles.splice(0, particles.length - max + 1);
  particles.push(p);
}

/** 1 = plenty of headroom, 0 = full. Multiply burst counts by this. */
function q() {
  const f = particles.length / maxParticles();
  return f > 0.88 ? 0.2 : f > 0.68 ? 0.5 : f > 0.45 ? 0.78 : 1;
}

/** Burst size helper: `n` scaled by the current particle headroom. */
function n(count) {
  return Math.max(1, Math.round(count * q()));
}

const MAT_COLOR = { wood: '#b1703a', stone: '#8d979e', glass: '#bfeaff', tnt: '#c44334' };

function chips(x, y, mat, count, power) {
  const col = MAT_COLOR[mat] || '#b1703a';
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (0.5 + Math.random()) * (power || 6);
    push({
      type: 'chip',
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - power * 0.4,
      w: 3 + Math.random() * 9,
      h: 2 + Math.random() * 5,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.5,
      life: 0,
      max: 70 + Math.random() * 70,
      color: mat === 'glass' ? 'rgba(200,244,255,.9)' : col
    });
  }
}

function shards(x, y, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 7;
    push({
      type: 'shard',
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 3,
      s: 3 + Math.random() * 7,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.7,
      life: 0,
      max: 45 + Math.random() * 35,
      color: 'rgba(214,250,255,.95)'
    });
  }
}

function smoke(x, y, count, size, tint) {
  for (let i = 0; i < count; i++) {
    push({
      type: 'smoke',
      x: x + (Math.random() - 0.5) * (size || 10),
      y: y + (Math.random() - 0.5) * (size || 10),
      vx: (Math.random() - 0.5) * 1.6,
      vy: -0.5 - Math.random() * 1.5,
      r: (size || 10) * (0.4 + Math.random() * 0.7),
      gr: 0.7 + Math.random() * 0.9,
      life: 0,
      max: 40 + Math.random() * 45,
      color: tint || 'rgba(238,240,235,'
    });
  }
}

function dust(x, y, count, power) {
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const sp = (0.4 + Math.random()) * (power || 3);
    push({
      type: 'smoke',
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: 5 + Math.random() * 12,
      gr: 1.1 + Math.random(),
      life: 0,
      max: 34 + Math.random() * 30,
      color: 'rgba(226,214,190,'
    });
  }
}

function fire(x, y, count, spread) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = Math.random() * (spread || 7);
    push({
      type: 'fire',
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 2,
      r: 7 + Math.random() * 16,
      life: 0,
      max: 22 + Math.random() * 22,
      color: Math.random() > 0.5 ? '255,214,120' : '255,140,60'
    });
  }
}

function sparks(x, y, count, dirX, dirY) {
  for (let i = 0; i < count; i++) {
    const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 2;
    const sp = 2 + Math.random() * 9;
    push({
      type: 'spark',
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      max: 18 + Math.random() * 22,
      color: '255,226,150'
    });
  }
}

function updateParticles() {
  const g = P.gPx || 0.28;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life++;
    if (p.type === 'smoke') {
      p.vy -= 0.012;
      p.vx *= 0.98;
      p.r += p.gr;
    } else if (p.type === 'fire') {
      p.vy -= 0.06;
      p.r *= 0.94;
    } else if (p.type === 'spark') {
      p.vy += g * 0.5;
      p.vx *= 0.97;
      p.vy *= 0.97;
    } else {
      p.vy += g;
      p.vx *= 0.995;
      p.vr *= 0.99;
    }
    p.x += p.vx;
    p.y += p.vy;
    if (p.life > p.max) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    const t = p.life / p.max;
    ctx.save();
    if (p.type === 'chip') {
      ctx.globalAlpha = 1 - t * t;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    } else if (p.type === 'shard') {
      ctx.globalAlpha = 1 - t;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, -p.s);
      ctx.lineTo(p.s * 0.8, p.s * 0.7);
      ctx.lineTo(-p.s * 0.6, p.s * 0.5);
      ctx.closePath();
      ctx.fill();
    } else if (p.type === 'smoke') {
      ctx.globalAlpha = (1 - t) * 0.85;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, p.color + '0.85)');
      g.addColorStop(1, p.color + '0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'fire') {
      ctx.globalAlpha = (1 - t) * 0.9;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, 'rgba(' + p.color + ',0.95)');
      g.addColorStop(0.6, 'rgba(' + p.color + ',0.5)');
      g.addColorStop(1, 'rgba(' + p.color + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'spark') {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = 'rgba(' + p.color + ',.95)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* --------------------------------------------------------------- init */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} config      the whole CONFIG
 * @param {object} builtLevel  from world.build()
 * @param {object} opts        { physics, sling, eagle, reduced, guides, bg }
 */
function init(canvas, config, builtLevel, opts = {}) {
  cv = canvas;
  ctx = cv.getContext('2d');
  cfg = config;
  level = builtLevel;
  sling = opts.sling || null;
  eagle = opts.eagle || null;
  reduced = !!opts.reduced;
  showGuides = !!opts.guides;

  // background layer toggles (?bg=off | ?bg=full)
  const bgMode = opts.bg || '';
  const bcfg = (cfg.render && cfg.render.background) || {};
  bg.use = bgMode === 'off' ? false : bgMode === 'full' ? true : bcfg.use !== false;
  const full = bgMode === 'full';
  bg.hideGround = full ? false : bcfg.hideGround !== false;
  bg.hideHills = full ? false : bcfg.hideHills !== false;
  bg.hideClouds = full ? false : bcfg.hideClouds !== false;
  bg.hideProps = full ? false : bcfg.hideProps !== false;
  bg.parallax = bcfg.parallax || 0;

  particles.length = 0;
  resize();
  cam.x = cam.tx = cfg.world.w / 2;
  cam.y = cam.ty = cfg.world.h / 2;
  cam.zoom = cam.tzoom = 1;
  computeRevealBox();
}

let revealBox = null;

function computeRevealBox() {
  if (!level || !level.towers.length) return;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  level.towers.forEach((t) => {
    const ix0 = t.island.cx - t.island.w / 2 - 30;
    const ix1 = t.island.cx + t.island.w / 2 + 30;
    x0 = Math.min(x0, ix0, t.x - 20);
    x1 = Math.max(x1, ix1, t.x + t.w + 20);
    y0 = Math.min(y0, t.y);
    y1 = Math.max(y1, t.island.topY + 26);
  });
  revealBox = { x0, x1, y0: y0 - 92, y1: y1 + 18 };
}

/** Camera focus for the final branding reveal. */
function revealFocus() {
  if (!revealBox) return { x: cfg.world.w / 2, y: cfg.world.h / 2 };
  return { x: (revealBox.x0 + revealBox.x1) / 2, y: cfg.world.h * 0.48 };
}

/*
  Two view modes:
    wide (desktop, landscape) — the whole 16:9 level is fitted on screen
    tall (portrait / narrow)   — the level is scaled to the *height* and the
                                camera pans horizontally (mouse wheel still
                                drives the site, the level pans by drag)
*/
function resize() {
  if (!cv) return;
  /*
    clientWidth/Height are the *layout* box. They are used on purpose: the hero
    canvas sits inside a wrapper that is CSS-scaled during the intro hand-off,
    and getBoundingClientRect() would report the enlarged visual box and
    therefore mis-size the world. Pointer maths in slingshot.js inverts the
    same transform.
  */
  const rect = cv.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = cv.clientWidth || rect.width;
  const ch = cv.clientHeight || rect.height;
  vw = Math.max(1, Math.round(cw));
  vh = Math.max(1, Math.round(ch));
  // If layout hasn't computed yet (0x0), retry next frame so we don't render a 1x1
  if (vw <= 1 || vh <= 1) {
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => resize());
    setTimeout(() => resize(), 16);
    setTimeout(() => resize(), 40);
    setTimeout(() => resize(), 80);
    setTimeout(() => resize(), 120);
    setTimeout(() => resize(), 200);
    setTimeout(() => resize(), 320);
    return;
  }
  cv.width = Math.round(vw * dpr);
  cv.height = Math.round(vh * dpr);
  try { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch { /* ignore */ }

  const cwCfg = cfg.world.w || 1600;
  const chCfg = cfg.world.h || 900;
  const contain = Math.min(vw / cwCfg, vh / chCfg);
  view.mode = vw / vh >= 1.5 ? 'wide' : 'tall';
  baseScale = view.mode === 'wide' ? contain : Math.max(contain, (vh * 0.96) / chCfg);
  view.baseScale = baseScale;
}

/* --------------------------------------------------------- camera api */

function defaultX() {
  // tall mode opens on the slingshot, wide mode shows the whole level
  return view.mode === 'tall' ? 430 : cfg.world.w / 2;
}

function lookAt(x, y, zoom) {
  cam.tx = x;
  cam.ty = y;
  cam.tzoom = zoom;
}

function resetCamera() {
  cam.tx = defaultX();
  cam.ty = cfg.world.h / 2;
  cam.tzoom = cfg.camera.zoomIdle;
}

/** Shift the camera target by a world-space delta (drag to pan). */
function panBy(dx, dy) {
  cam.tx -= dx;
  cam.ty -= dy;
}

function shake(amount) {
  cam.shake = Math.min(cfg.camera.shakeMax, cam.shake + amount);
}

function updateCamera(dtMs) {
  const k = 1 - Math.pow(1 - cfg.camera.followEase, dtMs / 16.667);
  const kz = 1 - Math.pow(1 - cfg.camera.zoomEase, dtMs / 16.667);
  cam.x += (cam.tx - cam.x) * k;
  cam.y += (cam.ty - cam.y) * k;
  cam.zoom += (cam.tzoom - cam.zoom) * kz;

  cam.shake *= Math.pow(cfg.camera.shakeDecay, dtMs / 16.667);
  if (cam.shake < 0.05) cam.shake = 0;
  const s = cam.shake;
  cam.sx = (Math.random() - 0.5) * s * 2;
  cam.sy = (Math.random() - 0.5) * s * 2;
  cam.srot = (Math.random() - 0.5) * s * 0.0016;

  const scale = baseScale * cam.zoom;
  view.scale = scale;

  // never let the camera show anything outside the level
  const halfW = vw / 2 / scale;
  const halfH = vh / 2 / scale;
  cam.x = halfW >= cfg.world.w / 2 ? cfg.world.w / 2 : Math.max(halfW, Math.min(cfg.world.w - halfW, cam.x));
  cam.y = halfH >= cfg.world.h / 2 ? cfg.world.h / 2 : Math.max(halfH, Math.min(cfg.world.h - halfH, cam.y));

  view.ox = vw / 2 - cam.x * scale + cam.sx;
  view.oy = vh / 2 - cam.y * scale + cam.sy;
}

/* -------------------------------------------------------- environment */
// Layer toggles. assets/background.png is an opaque 16:9 scene, so when it
// loads it replaces the painted sky / hills / clouds / grass. `?bg=off`
// forces the procedural scenery, `?bg=full` keeps every layer on top of it.
const bg = {
  use: true,
  hideGround: true,
  hideHills: true,
  hideClouds: true,
  hideProps: true,
  parallax: 0
};

function backdropImage() {
  return bg.use && art.hasBackground() ? art.background() : null;
}

/**
 * Cover-fit the background image over the viewport. Drawn in screen space so it
 * never runs out of edges as the camera pans.
 */
function drawBackdropImage(img) {
  const ar = img.width / img.height;
  let boxW = vw;
  let boxH = boxW / ar;
  if (boxH < vh) {
    boxH = vh;
    boxW = boxH * ar;
  }
  let ox = (vw - boxW) / 2;
  let oy = (vh - boxH) / 2;
  if (bg.parallax) {
    const px = (cam.x - cfg.world.w / 2) * (1 - bg.parallax);
    const py = (cam.y - cfg.world.h / 2) * (1 - bg.parallax);
    ox += -px * view.scale * 0.5;
    oy += -py * view.scale * 0.5;
  }
  ctx.drawImage(img, ox, oy, boxW, boxH);
  // if the parallax shift exposed an edge, flood-fill it with the sky colour
  if (ox > 0 || oy > 0 || ox + boxW < vw || oy + boxH < vh) {
    ctx.fillStyle = '#63b3e6';
    if (ox > 0) ctx.fillRect(0, 0, ox, vh);
    if (oy > 0) ctx.fillRect(0, 0, vw, oy);
    if (ox + boxW < vw) ctx.fillRect(ox + boxW, 0, vw, vh);
    if (oy + boxH < vh) ctx.fillRect(0, oy + boxH, vw, vh);
  }
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, '#2b78c9');
  g.addColorStop(0.38, '#63b3e6');
  g.addColorStop(0.72, '#a9dcf3');
  g.addColorStop(1, '#d8f0f7');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  // sun glow
  const sx = vw * 0.82;
  const sy = vh * 0.16;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, vh * 0.55);
  sg.addColorStop(0, 'rgba(255,250,225,.85)');
  sg.addColorStop(0.18, 'rgba(255,244,196,.32)');
  sg.addColorStop(1, 'rgba(255,244,196,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, vw, vh);
}

function drawBackdrop() {
  const img = backdropImage();
  if (img) drawBackdropImage(img);
  else drawSky();
}

function layerOffset(p) {
  const scale = view.scale;
  return {
    scale,
    x: vw / 2 - cam.x * p * scale + cam.sx * p,
    y: vh / 2 - cam.y * p * scale + cam.sy * p
  };
}

function drawHills() {
  level.hills.forEach((h) => {
    const o = layerOffset(h.parallax);
    const img = art.hills(h.w, h.h, h.color, 0, h.seed, h.rough);
    const w = h.w * o.scale;
    const hh = h.h * o.scale;
    const top = o.y + h.y * o.scale;
    const start = Math.floor((-o.x - w) / w) * w;
    for (let x = start; x < vw + w; x += w) {
      ctx.drawImage(img, x, top, w, hh);
    }
  });
}

function drawClouds(t) {
  const drift = reduced ? 0 : t * 0.001;
  level.clouds.forEach((c) => {
    const p = 0.12 + c.layer * 0.16;
    const o = layerOffset(p);
    const w = c.w * o.scale * (0.7 + c.layer * 0.22);
    const h = c.h * o.scale * (0.7 + c.layer * 0.22);
    let x = o.x + c.x * o.scale + drift * c.speed * 60 * (0.4 + c.layer);
    const y = o.y + c.y * o.scale;
    const total = cfg.world.w + 900;
    x = (((x - o.x) % total) + total) % total + o.x - 300;
    ctx.globalAlpha = 0.5 + c.layer * 0.2;
    ctx.drawImage(art.cloud(c.w, c.h, c.seed), x, y, w, h);
  });
  ctx.globalAlpha = 1;
}

function drawMotes(t) {
  if (reduced) return;
  const o = layerOffset(0.9);
  ctx.save();
  level.motes.forEach((m) => {
    const yy = m.y + Math.sin(t * 0.0009 + m.ph) * 22;
    const xx = m.x + Math.cos(t * 0.0006 + m.ph) * 16;
    ctx.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(t * 0.002 + m.ph));
    ctx.fillStyle = '#fff8dc';
    ctx.beginPath();
    ctx.arc(o.x + xx * o.scale, o.y + yy * o.scale, m.r * o.scale, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawProps() {
  level.props.forEach((p) => {
    const tex = art.block(p.mat, p.w, p.h);
    ctx.save();
    ctx.globalAlpha = p.far ? 0.55 : 0.9;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.drawImage(tex, -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  });
}

function worldBottom() {
  return vh / view.scale;
}

function drawGround(t) {
  const gy = level.groundY;
  const left = toWorld(0, 0).x - 40;
  const right = toWorld(vw, 0).x + 40;

  // dirt
  const dg = ctx.createLinearGradient(0, gy, 0, gy + 260);
  dg.addColorStop(0, '#a2703f');
  dg.addColorStop(0.35, '#8a5a2f');
  dg.addColorStop(1, '#5d3a1c');
  ctx.fillStyle = dg;
  ctx.fillRect(left, gy, right - left, worldBottom() + 120 - gy);

  // soil speckle
  ctx.save();
  ctx.globalAlpha = 0.25;
  const rand = art.rng(4242);
  for (let i = 0; i < 160; i++) {
    const x = left + rand() * (right - left);
    const y = gy + 14 + rand() * 220;
    ctx.fillStyle = rand() > 0.5 ? '#3f2611' : '#c08a52';
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + rand() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // grass cap with scalloped edge
  ctx.fillStyle = '#69b83c';
  ctx.beginPath();
  ctx.moveTo(left, gy + 30);
  const step = 26;
  for (let x = left; x < right; x += step) {
    ctx.quadraticCurveTo(x + step / 2, gy - 6, x + step, gy + 2);
  }
  ctx.lineTo(right, gy + 34);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fillRect(left, gy + 26, right - left, 5);

  // grass tufts
  if (!reduced) {
    level.grass.forEach((gr) => {
      if (gr.x < left - 40 || gr.x > right + 40) return;
      art.grassTuft(ctx, gr.x, gy + 2, gr.w, t, gr.phase, 'rgba(74,158,52,.95)');
    });
  }
}

/* -------------------------------------------------------- reveal box
   The branding curtain that used to sit behind the towers has been removed —
   nothing is drawn behind the structure now. The camera still focuses on the
   cleared area via revealFocus(). */

/* ----------------------------------------------------------- entities */

function drawIslands() {
  level.islands.forEach((isl, i) => {
    art.drawIsland(ctx, isl.cx, isl.topY, isl.w, isl.drop || 90, 900 + i * 7);
  });
}

function drawBlocks() {
  P.blocks.forEach((body) => {
    const meta = body.plugin.cb2;
    if (!meta.alive) return;
    // Look the texture up live (instead of the one baked at build time) so the
    // drop-in wood/stone/glass/TNT PNGs appear as soon as they finish loading.
    const tex = art.block(meta.mat, meta.w, meta.h);
    // Draw a hair larger than the cell so blocks overlap and read as one solid
    // mass (no antialiased seams between neighbours).
    const pad = Math.max(1, Math.min(meta.w, meta.h) * 0.08);
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    ctx.drawImage(tex, -(meta.w + pad) / 2, -(meta.h + pad) / 2, meta.w + pad, meta.h + pad);
    ctx.restore();
  });
}

function drawDebris() {
  for (const d of P.debris) {
    const b = d.body;
    const pad = Math.max(1, Math.min(d.w, d.h) * 0.08);
    ctx.save();
    if (d.fade !== undefined) ctx.globalAlpha = d.fade;
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.drawImage(art.block(d.mat, d.w, d.h), -(d.w + pad) / 2, -(d.h + pad) / 2, d.w + pad, d.h + pad);
    ctx.restore();
  }
}

function drawPigs(t) {
  P.pigs.forEach((pig) => {
    const meta = pig.plugin.cb2;
    ctx.save();
    ctx.translate(pig.position.x, pig.position.y + Math.sin(t * 0.003 + meta.phase) * 1.5);
    art.drawPig(ctx, meta.r, t, false);
    ctx.restore();
  });
}

/**
 * The sculpture is the hero of the page, so in the desktop (wide) view it is
 * pinned to the exact same screen spot as the slingshot: camera panning,
 * zooming and even the impact shake can never nudge it. (Zoom is disabled in
 * config anyway; this is the belt-and-braces guarantee.)
 */
function drawStructure(t) {
  if (view.mode !== 'wide') {
    drawBlocks();
    drawDebris();
    drawPigs(t);
    return;
  }
  ctx.save();
  applyRestTransform();
  drawBlocks();
  drawDebris();
  drawPigs(t);
  ctx.restore();
}

/**
 * Absolute screen-space transform matching the camera *at rest* (no pan, no
 * zoom, no shake). Drawing the slingshot through this pins it to the same
 * screen spot for the whole level, so the cinematic camera can never move or
 * shake it. During aiming the live camera is already at rest, so this is
 * pixel-identical to the normal world transform there.
 */
function applyRestTransform() {
  const scale = baseScale * cfg.camera.zoomIdle;
  const halfW = vw / 2 / scale;
  const halfH = vh / 2 / scale;
  let cx = defaultX();
  let cy = cfg.world.h / 2;
  cx = halfW >= cfg.world.w / 2 ? cfg.world.w / 2 : Math.max(halfW, Math.min(cfg.world.w - halfW, cx));
  cy = halfH >= cfg.world.h / 2 ? cfg.world.h / 2 : Math.max(halfH, Math.min(cfg.world.h - halfH, cy));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(vw / 2 - cx * scale, vh / 2 - cy * scale);
  ctx.scale(scale, scale);
}

function drawSling() {
  if (!sling) return;
  const scl = (cfg.sling && cfg.sling.artScale) || 1;

  // Pinned: skip the live camera (pan/zoom/shake) for the whole assembly.
  ctx.save();
  applyRestTransform();

  const tips = art.slingTips(sling.rest.x, sling.rest.y, level.groundY, scl);

  // The elastic follows the can while it is still held, then snaps back to
  // rest — otherwise the slingshot would be left with no bands at all.
  const b = P.projectile ? P.projectile.position : null;
  const attached = sling.visible && b && Math.hypot(b.x - sling.rest.x, b.y - sling.rest.y) < cfg.sling.radius * 5;

  const ax = attached ? b.x : sling.visible ? sling.pos.x : sling.rest.x;
  const ay = attached ? b.y : sling.visible ? sling.pos.y : sling.rest.y;

  // Bands first, then the slingshot sprite on top, so the mechanics sit
  // *behind* slingshot.png (the fork opening reveals the pouch/can).
  art.drawBands(ctx, tips, ax, ay, 1);
  art.drawSling(ctx, sling.rest.x, sling.rest.y, level.groundY, 0, scl);
  ctx.restore();
}

function drawTrajectory() {
  if (!sling || !sling.aim) return;
  const pts = sling.aim;
  ctx.save();
  for (let i = 0; i < pts.length; i++) {
    const k = 1 - i / pts.length;
    ctx.globalAlpha = 0.16 + k * 0.72;
    ctx.fillStyle = '#fff8dc';
    const r = (1.6 + k * 3.4) * (view.scale * 0.8 + 0.3);
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawProjectile(t) {
  if (!P.projectile) return;
  const b = P.projectile;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  art.drawFish(ctx, cfg.sling.radius * 2, t);
  ctx.restore();
}

/**
 * The can while it is still in the pouch: resting (idle) *or* pulled back by
 * the player (aiming) or by the auto-play (auto). Once it has been fired the
 * sling sets visible = false and drawProjectile takes over.
 */
function drawPouchCan(t) {
  if (!sling || !sling.visible || sling.state === 'spent') return;

  const idle = sling.state === 'idle';
  const wob = idle ? Math.sin(t * 0.004) * 0.09 : 0;
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.005);

  ctx.save();
  applyRestTransform(); // stays glued to the pinned slingshot
  ctx.translate(sling.pos.x, sling.pos.y);

  // hint glow — only while the can is waiting to be grabbed
  if (idle) {
    const r = cfg.sling.radius * (2.1 + pulse * 0.5);
    const g = ctx.createRadialGradient(0, 0, 6, 0, 0, r);
    g.addColorStop(0, 'rgba(255,236,170,' + (0.34 + pulse * 0.2).toFixed(2) + ')');
    g.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.rotate(wob);
  art.drawFish(ctx, cfg.sling.radius * 2, t);
  ctx.restore();
}

function drawEagleSprite() {
  if (!eagle || !eagle.visible) return;
  /*
    Size the eagle to ONE cell of a 3x3 grid laid over the screen (≈ one third
    of the viewport), times the configured `eagleScale` so it can be sized up.
    We derive the world-space scale from the live view scale so the on-screen
    size stays constant regardless of camera zoom during the cinematic.
  */
  const baseW = (cfg.assets && cfg.assets.eagleWidth) || 168;
  const boost = (cfg.assets && cfg.assets.eagleScale) || 1;
  const targetScreenW = (vw / 3) * boost;
  const scale = targetScreenW / Math.max(1, baseW * view.scale);
  ctx.save();
  ctx.translate(eagle.pos.x, eagle.pos.y);

  // Full-colour eagle first…
  art.drawEagle(ctx, eagle.angle, eagle.phase * 13, scale);

  // …then the same silhouette in flat black straight on top. No blur and no
  // offset — it reads as a flat cel-shaded overlay rather than a soft drop
  // shadow (and costs a fraction of the old shadowBlur pass).
  if ('filter' in ctx) {
    ctx.globalAlpha = 0.84;
    ctx.filter = 'brightness(0)';
    art.drawEagle(ctx, eagle.angle, eagle.phase * 13, scale);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawGuide() {
  if (!showGuides || !towerGuide) return;
  ctx.save();
  ctx.globalAlpha = 0.4;
  const w = cfg.world.w;
  const h = towerGuide.height * (w / towerGuide.width);
  ctx.drawImage(towerGuide, 0, cfg.world.groundY - h + 20, w, h);
  ctx.restore();
}

function drawVignette() {
  const g = ctx.createRadialGradient(
    vw / 2,
    vh * 0.46,
    Math.min(vw, vh) * 0.34,
    vw / 2,
    vh * 0.5,
    Math.max(vw, vh) * 0.78
  );
  g.addColorStop(0, 'rgba(8,16,26,0)');
  g.addColorStop(1, 'rgba(8,16,26,.34)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

/* ------------------------------------------------------------- frame */

/**
 * @param {number} now  performance.now()
 * @param {number} dt   ms since last frame
 */
function frame(now, dt) {
  if (!ctx) return;

  drawBackdrop();
  updateCamera(dt);

  ctx.save();
  if (cam.srot) {
    ctx.translate(vw / 2, vh / 2);
    ctx.rotate(cam.srot);
    ctx.translate(-vw / 2, -vh / 2);
  }

  const hasBg = !!backdropImage();
  if (!hasBg || !bg.hideHills) drawHills();
  if (!hasBg || !bg.hideClouds) drawClouds(now);
  if (!hasBg || !bg.hideGround) drawGround(now);
  if (!hasBg || !bg.hideProps) drawProps();
  drawGuide();

  // world space
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (cam.srot) {
    ctx.translate(vw / 2, vh / 2);
    ctx.rotate(cam.srot);
    ctx.translate(-vw / 2, -vh / 2);
  }
  ctx.translate(view.ox, view.oy);
  ctx.scale(view.scale, view.scale);

  drawIslands();
  drawStructure(now);
  drawSling();
  drawPouchCan(now);
  drawTrajectory();
  drawProjectile(now);
  drawEagleSprite();
  drawMotes(now);
  updateParticles();
  drawParticles();

  ctx.restore();
  ctx.restore();

  drawVignette();
}

function setTowerGuide(img) {
  towerGuide = img;
}

function getSize() {
  return { w: vw, h: vh };
}


return { get reduced() { return reduced; }, get showGuides() { return showGuides; }, view, toWorld, toScreen, particles, q, n, chips, shards, smoke, dust, fire, sparks, init, get revealBox() { return revealBox; }, revealFocus, resize, lookAt, resetCamera, panBy, shake, frame, setTowerGuide, getSize };
})();


/* ============================ game/slingshot.js ============================ */
const sling = (() => {
/* ==========================================================================
   Code Bounty 2.0 — slingshot.js
   --------------------------------------------------------------------------
   Click + hold the sardine can, drag backwards to aim, release to launch.
   A dotted ballistic preview is drawn while aiming (it runs the exact same
   integrator the physics engine uses, so the dots are the real path).

   Supports:
     • mouse, touch and pen (pointer events)
     • keyboard: arrow keys pull the pouch, space/enter fires
     • a self-playing demo shot so the level never blocks the visitor

   `render` and `physics` are handed to init() rather than imported, so this
   module never has to import the renderer (which already draws the sling).
   ========================================================================== */


let cfg = null;
let cv = null;
let level = null;
let render = null;
let hooks = {};

let pointerId = null;
let autoT = 0;
let autoTarget = null;
let springT = 1;
let springFrom = { x: 0, y: 0 };
let keyPull = { x: 0, y: 0 };

/* --------------------------------------------------------------- state */
const sling = {
  state: 'idle', // idle | aiming | auto | spent
  visible: true,
  aim: null,
  pos: { x: 0, y: 0 },
  rest: { x: 0, y: 0 },
  pull: 0
};

const S = sling; // internal shorthand

/* --------------------------------------------------------------- init */

/**
 * @param {object} config  the whole CONFIG
 * @param {HTMLCanvasElement} canvas
 * @param {object} levelData  from world.build()
 * @param {object} deps      { render, onFire, onDragChange, onPan, onPanStart, onPanEnd }
 */
function init(config, canvas, levelData, deps = {}) {
  cfg = config;
  cv = canvas;
  level = levelData;
  render = deps.render;
  hooks = deps;

  S.rest = { x: cfg.sling.x, y: cfg.sling.y };
  S.pos = { x: S.rest.x, y: S.rest.y };
  S.state = 'idle';
  S.visible = true;
  S.pull = 0;
  S.aim = null;

  pointerId = null;
  autoT = 0;
  autoTarget = null;
  springT = 1;
  keyPull = { x: 0, y: 0 };

  cv.addEventListener('pointerdown', onDown, { passive: false });
  cv.addEventListener('pointermove', onMove, { passive: false });
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('keydown', onKey);
  cv.addEventListener('contextmenu', onContext);
}

/** Detach every listener (React unmount / StrictMode double-invoke). */
function dispose() {
  if (!cv) return;
  cv.removeEventListener('pointerdown', onDown);
  cv.removeEventListener('pointermove', onMove);
  cv.removeEventListener('pointerup', onUp);
  cv.removeEventListener('pointercancel', onUp);
  cv.removeEventListener('keydown', onKey);
  cv.removeEventListener('contextmenu', onContext);
  cv = null;
}

function onContext(e) {
  if (S.state === 'aiming') e.preventDefault();
}

/**
 * Pointer position in *canvas layout pixels*.
 *
 * getBoundingClientRect() gives the visual box, and the hero canvas is inside a
 * wrapper that is CSS-scaled during the intro hand-off — so the offset is
 * divided by the same factor to land back in the coordinate space the renderer
 * works in (which is measured from clientWidth/Height).
 */
function worldFromEvent(e) {
  const r = cv.getBoundingClientRect();
  const sx = (e.clientX - r.left) * ((cv.clientWidth || r.width) / (r.width || 1));
  const sy = (e.clientY - r.top) * ((cv.clientHeight || r.height) / (r.height || 1));
  return render.toWorld(sx, sy);
}

/* ------------------------------------------------------------- pointer */

function onDown(e) {
  if (S.state !== 'idle') return;
  const p = worldFromEvent(e);
  const grab = cfg.sling.radius * 2.1;
  if (Math.hypot(p.x - S.rest.x, p.y - S.rest.y) > grab) {
    // not on the can -> pan the level (portrait / narrow viewports)
    if (hooks.onPanStart) hooks.onPanStart(p);
    pointerId = e.pointerId;
    return;
  }

  e.preventDefault();
  pointerId = e.pointerId;
  try {
    cv.setPointerCapture(pointerId);
  } catch {
    /* capture unsupported — pointermove on the canvas still works */
  }
  S.state = 'aiming';
  S.pos = { x: S.rest.x, y: S.rest.y };
  updatePull(p.x, p.y);
}

function onMove(e) {
  if (e.pointerId !== pointerId) return;
  if (S.state !== 'aiming') {
    if (hooks.onPan) {
      e.preventDefault();
      hooks.onPan(worldFromEvent(e));
    }
    return;
  }
  e.preventDefault();
  const p = worldFromEvent(e);
  updatePull(p.x, p.y);
}

function onUp(e) {
  if (pointerId !== null && e.pointerId !== pointerId) return;
  pointerId = null;
  if (hooks.onPanEnd) hooks.onPanEnd();
  if (S.state !== 'aiming') return;
  const pullVec = { x: S.rest.x - S.pos.x, y: S.rest.y - S.pos.y };
  if (Math.hypot(pullVec.x, pullVec.y) < cfg.sling.minPull) {
    springBack();
    return;
  }
  fire();
}

/** Keep the pouch inside the elastic limit. */
function updatePull(px, py) {
  let dx = px - S.rest.x;
  let dy = py - S.rest.y;
  const d = Math.hypot(dx, dy);
  const max = cfg.sling.maxPull;
  if (d > max) {
    dx = (dx / d) * max;
    dy = (dy / d) * max;
  }
  S.pos = { x: S.rest.x + dx, y: S.rest.y + dy };
  S.pull = Math.min(1, d / max);
  S.aim = computeAim();
  if (hooks.onDragChange) hooks.onDragChange(S.pull);
}

function springBack() {
  springFrom = { x: S.pos.x, y: S.pos.y };
  springT = 0;
  S.state = 'idle';
  S.aim = null;
  S.pull = 0;
}

/* ---------------------------------------------------------- trajectory */

/** How many fixed 1/60 s steps the can should stay in the air. */
function flightSteps() {
  const ms = (cfg.sling && cfg.sling.flightMs) || 3000;
  return Math.max(1, Math.round(ms / (1000 / 60)));
}

/** Launch velocity implied by the current pouch position (the "drag" shot). */
function launchVelocity(pos) {
  return {
    x: (S.rest.x - pos.x) * cfg.sling.power,
    y: (S.rest.y - pos.y) * cfg.sling.power
  };
}

/**
 * First point along a path that touches a tower. Each tower box is inflated
 * by the can's radius so this is the moment the *edge* makes contact, which
 * is when Matter will actually raise the collision.
 */
function firstTowerHit(path) {
  const r = cfg.sling.radius;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    for (let j = 0; j < level.towers.length; j++) {
      const t = level.towers[j];
      if (p.x >= t.x - r && p.x <= t.x + t.w + r && p.y >= t.y - r && p.y <= t.y + t.h + r) {
        return { i, x: p.x, y: p.y };
      }
    }
  }
  return null;
}

/**
 * Where the raw drag shot would first touch the sculpture: the first contact
 * of the pull-implied path, or its farthest point if it clears everything.
 */
function predictedTarget(pos, v) {
  const path = P.ballistic(pos, v, 600);
  const hit = firstTowerHit(path);
  if (hit) return { x: hit.x, y: hit.y };
  let far = path.length ? path[0] : pos;
  for (let i = 1; i < path.length; i++) if (path[i].x > far.x) far = path[i];
  return far;
}

/**
 * Solve a launch from `pos` that makes *first contact* happen after exactly
 * `flightSteps()`. We solve towards the desired point, see where that arc
 * actually touches the sculpture first, and re-aim at that contact a couple of
 * times — so a shot aimed deep into BOUNTY still lands on whatever is in the
 * way (CODE) precisely on the 3 s beat, with no early hit.
 */
function timedTarget(pos, desired) {
  const steps = flightSteps();
  let target = desired;
  for (let iter = 0; iter < 4; iter++) {
    const v = P.velocityFor(pos, target, steps);
    const hit = firstTowerHit(P.ballistic(pos, v, steps + 10));
    if (!hit || hit.i >= steps - 4) break;
    target = { x: hit.x, y: hit.y };
  }
  return P.velocityFor(pos, target, steps);
}

/**
 * The launch velocity actually used: it always makes first contact after
 * exactly `flightMs` — the drag only chooses *where* the shot goes, not how
 * long it takes. Every shot therefore touches a tower ~3 s after release.
 */
function timedVelocity(pos) {
  if (autoTarget && autoTarget.tx != null) {
    return timedTarget(pos, { x: autoTarget.tx, y: autoTarget.ty });
  }
  const raw = launchVelocity(pos);
  const target = predictedTarget(pos, raw);
  return target ? timedTarget(pos, target) : raw;
}

/** The real flight path — same integrator as the solver, so the dots are truth. */
function computeAim() {
  return P.ballistic(S.pos, timedVelocity(S.pos), flightSteps() + 30);
}

/* --------------------------------------------------------------- fire */

function fire() {
  const v = timedVelocity(S.pos);
  const mag = Math.hypot(v.x, v.y) || 1;
  if (mag < 0.4) {
    springBack();
    return;
  }
  const origin = { x: S.pos.x, y: S.pos.y };
  S.state = 'spent';
  S.aim = null;
  S.visible = false;
  S.pull = 0;
  autoTarget = null;
  if (hooks.onFire) {
    hooks.onFire({ x: origin.x, y: origin.y, vx: v.x, vy: v.y, power: Math.min(1, mag / (cfg.sling.maxPull * cfg.sling.power)) });
  }
}

/* --------------------------------------------------------------- auto */

/**
 * Resolve the auto-play shot for a tower. The launch velocity is solved for
 * the fixed flight time, so the demo/skip shot always touches down after
 * exactly `flightMs`. Used by the idle demo and the SKIP INTERACTION
 * fast-forward so both aim into the solid part of the sculpture.
 */
function solveAuto(targetTowerIndex) {
  const towers = level.towers;
  if (!towers.length) return null;
  const t = towers[Math.min(towers.length - 1, Math.max(0, targetTowerIndex || 0))];

  // Aim at a block that is actually there: letters like C, O and U have a
  // hole in the middle, so aim at the solid left-hand column instead.
  const midY = t.y + t.h / 2;
  const col = t.blocks
    .filter((b) => b.x <= t.x + cfg.towers.cell * 1.6)
    .sort((a, b) => Math.abs(a.y - midY) - Math.abs(b.y - midY))[0];
  const tx = col ? col.x : t.cx;
  const ty = col ? col.y : t.y + t.h * 0.55;

  // Display pull: back away opposite the solved launch so it reads as a drag,
  // clamped to the elastic limit. The launch is then solved from that visible
  // pouch, so the pull and the flight are consistent.
  const v0 = timedTarget(S.rest, { x: tx, y: ty });
  const dx = -v0.x / cfg.sling.power;
  const dy = -v0.y / cfg.sling.power;
  const d = Math.hypot(dx, dy) || 1;
  const max = cfg.sling.maxPull;
  const k = Math.min(1, max / d);
  const px = S.rest.x + dx * k;
  const py = S.rest.y + dy * k;

  const v = timedTarget({ x: px, y: py }, { x: tx, y: ty });
  return {
    x: px,
    y: py,
    vx: v.x,
    vy: v.y,
    tx,
    ty,
    power: Math.min(1, Math.hypot(v.x, v.y) / (max * cfg.sling.power)),
    miss: 0
  };
}

function autoPlay(targetTowerIndex) {
  if (S.state !== 'idle') return false;
  const shot = solveAuto(targetTowerIndex);
  if (!shot) return false;
  autoTarget = shot;
  autoT = 0;
  S.state = 'auto';
  S.aim = null;
  return true;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function updateAuto(dt) {
  autoT += dt;
  const pullMs = 720;
  const holdMs = 420;

  if (autoT <= pullMs) {
    const k = easeOutCubic(autoT / pullMs);
    // a touch of hand-shake, but small enough not to spoil the solved arc
    const jitter = Math.sin(autoT * 0.05) * 1.2 * (1 - k);
    S.pos = {
      x: S.rest.x + (autoTarget.x - S.rest.x) * k + jitter,
      y: S.rest.y + (autoTarget.y - S.rest.y) * k - jitter * 0.6
    };
    S.pull = k * autoTarget.power;
    S.aim = computeAim();
    if (hooks.onDragChange) hooks.onDragChange(S.pull);
  } else if (autoT <= pullMs + holdMs) {
    const wob = Math.sin((autoT - pullMs) * 0.06) * 1.6;
    S.pos = { x: autoTarget.x + wob, y: autoTarget.y - wob * 0.5 };
    S.aim = computeAim();
    if (hooks.onDragChange) hooks.onDragChange(S.pull);
  } else {
    fire();
    autoTarget = null;
  }
}

/* ------------------------------------------------------------ keyboard */

function onKey(e) {
  if (S.state === 'spent') return;
  const step = 12;
  let handled = true;
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      keyPull.x -= step;
      keyPull.y += step * 0.55;
      break;
    case 'ArrowRight':
    case 'ArrowUp':
      keyPull.x += step;
      keyPull.y -= step * 0.55;
      break;
    case ' ':
    case 'Enter': {
      if (S.state === 'idle') {
        keyPull = { x: -90, y: 52 };
        S.state = 'aiming';
      }
      const mag = Math.hypot(keyPull.x, keyPull.y);
      if (mag > cfg.sling.minPull) {
        S.pos = { x: S.rest.x + keyPull.x, y: S.rest.y + keyPull.y };
        S.pull = Math.min(1, mag / cfg.sling.maxPull);
        S.aim = computeAim();
        fire();
        keyPull = { x: 0, y: 0 };
      }
      break;
    }
    default:
      handled = false;
  }
  if (!handled) return;
  e.preventDefault();
  if (S.state !== 'aiming' || e.key === ' ' || e.key === 'Enter') return;
  // clamp the keyboard pull inside the elastic limit
  const max = cfg.sling.maxPull;
  const d = Math.hypot(keyPull.x, keyPull.y);
  if (d > max) {
    keyPull.x = (keyPull.x / d) * max;
    keyPull.y = (keyPull.y / d) * max;
  }
  S.pos = { x: S.rest.x + keyPull.x, y: S.rest.y + keyPull.y };
  S.pull = Math.min(1, d / max);
  S.aim = computeAim();
  if (hooks.onDragChange) hooks.onDragChange(S.pull);
}

/* --------------------------------------------------------------- frame */

function update(dt) {
  if (S.state === 'auto') updateAuto(dt);
  else if (S.state === 'idle' && springT < 1) {
    springT = Math.min(1, springT + dt / 240);
    const k = 1 - Math.pow(1 - springT, 3);
    S.pos = {
      x: springFrom.x + (S.rest.x - springFrom.x) * k,
      y: springFrom.y + (S.rest.y - springFrom.y) * k
    };
  }
}

function reset() {
  S.state = 'idle';
  S.visible = true;
  S.pull = 0;
  S.aim = null;
  S.pos = { x: S.rest.x, y: S.rest.y };
  autoTarget = null;
  pointerId = null;
  springT = 1;
  keyPull = { x: 0, y: 0 };
}

const isIdle = () => S.state === 'idle' || S.state === 'aiming';


return { sling, init, dispose, computeAim, solveAuto, autoPlay, update, reset, isIdle };
})();


/* ============================ game/eagle.js ============================ */
const eagle = (() => {
/* ==========================================================================
   Code Bounty 2.0 — eagle.js
   --------------------------------------------------------------------------
   The Mighty Eagle entrance: swoops in from the top-left, tears diagonally
   through the remaining towers and exits bottom-right, leaving a wind trail
   that clears whatever is left of the level.

   Path is a cubic bezier tuned so the flight line passes *through* the tower
   row (letters sit around y 535-640 in the 1920x1080 world).

   The staggered wind-trail blasts are scheduled with setTimeout so they read
   as a ripple rather than one simultaneous pop. Every timer is tracked in
   `timers` and cleared by reset()/dispose(), so a replay can never be
   overwritten by a stale blast from a previous run.
   ========================================================================== */


let cfg = null;
let render = null;
let onEnd = null;
let t = 0;
let running = false;
let cleanedUp = false;

/** Timers owned by the eagle (cleared on reset/dispose). */
const timers = new Set();

function after(ms, fn) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers.clear();
}

/* --------------------------------------------------------------- state */

const eagle = {
  visible: false,
  pos: { x: -400, y: -340 },
  angle: 0,
  scale: 0.6, // ~1/9 screen height relative to base width
  phase: 0,
  progress: 0
};

const E = eagle;

// control points (world space)
const P0 = { x: -400, y: -340 };
const P1 = { x: 280, y: 180 };
const P2 = { x: 1000, y: 560 };
const P3 = { x: 2400, y: 1250 };

function bezier(t2) {
  const u = 1 - t2;
  const a = u * u * u;
  const b = 3 * u * u * t2;
  const c = 3 * u * t2 * t2;
  const d = t2 * t2 * t2;
  return {
    x: a * P0.x + b * P1.x + c * P2.x + d * P3.x,
    y: a * P0.y + b * P1.y + c * P2.y + d * P3.y
  };
}

/* --------------------------------------------------------------- init */

/** @param {object} config  @param {{render:object, onEnd:Function}} deps */
function init(config, deps = {}) {
  cfg = config;
  render = deps.render;
  onEnd = deps.onEnd || null;
  clearTimers();
  running = false;
  cleanedUp = false;
  E.visible = false;
  E.progress = 0;
  E.pos = { x: P0.x, y: P0.y };
  const s = (cfg.assets && cfg.assets.eagleScale) || 0.6;
  E.scale = s;
}

/** Kick off the cinematic. */
function start() {
  if (running) return;
  running = true;
  cleanedUp = false;
  t = 0;
  clearTimers();
  const p0 = bezier(0);
  E.visible = true;
  E.progress = 0;
  E.pos = { x: p0.x, y: p0.y };
  E.angle = 0.5;
}

const isRunning = () => running;

/* -------------------------------------------------------------- frame */

function update(dt) {
  if (!running) return;
  t += dt;
  const dur = cfg.timing.eagleDuration;
  const k = Math.min(1, t / dur);

  const pos = bezier(k);
  const ahead = bezier(Math.min(1, k + 0.006));
  const dx = ahead.x - pos.x;
  const dy = ahead.y - pos.y;

  E.pos.x = pos.x;
  E.pos.y = pos.y;
  E.angle = Math.atan2(dy, dx);
  E.phase += dt * 0.001;
  E.progress = k;

  // destroy everything the eagle passes through
  const vx = (dx / Math.max(1, dt)) * 16.667;
  const vy = (dy / Math.max(1, dt)) * 16.667;
  const len = Math.hypot(vx, vy) || 1;
  const radius = cfg.timing.eagleRadius * (k > 0.9 ? 1.15 : 1);
  P.sweep(pos.x, pos.y, radius, vx / len, vy / len, 13);

  // everything the eagle has flown past collapses in its wake, whether or not
  // it actually touched it — the whole sculpture falls as the eagle sweeps by
  wakeCollapse(pos.x);

  // wind streaks behind the eagle
  if (render && !render.reduced && Math.random() < 0.6) {
    render.sparks(pos.x - Math.cos(E.angle) * 40, pos.y - Math.sin(E.angle) * 40, 1, -vx / len, -vy / len);
  }

  // once the eagle has finished tearing across (and is past the sculpture),
  // break whatever is still standing into debris so it falls apart
  if (k > 0.9 && !cleanedUp) {
    cleanedUp = true;
    finalSweep();
  }

  if (k >= 1) {
    running = false;
    E.visible = false;
    if (onEnd) onEnd();
  }
}

/**
 * The eagle's wake: any block the eagle has just flown past breaks loose and
 * falls under gravity, and any pig it has passed pops — regardless of whether
 * the eagle actually touched them. Because the path runs left to right, this
 * reads as the collapse chasing the eagle across the sculpture.
 */
function wakeCollapse(ex) {
  const lag = 40; // let the eagle lead before its wake hits a piece
  const cut = ex - lag;

  P.blocks.forEach((b) => {
    const meta = b.plugin && b.plugin.cb2;
    if (!meta || !meta.alive) return;
    if (b.position.x >= cut) return;
    P.shatter(
      b,
      { x: (Math.random() - 0.35) * 1.4, y: 0.4 + Math.random() * 1.2 },
      (Math.random() - 0.5) * 0.3
    );
  });

  P.pigs.slice().forEach((p) => {
    const meta = p.plugin && p.plugin.cb2;
    if (!meta || !meta.alive) return;
    if (p.position.x < cut) P.popPig(p);
  });
}

/**
 * After the eagle has crashed through, break whatever is still standing into
 * debris so the sculpture falls apart under gravity. Blocks are frozen for the
 * whole intro so the artwork is rock-steady; once the eagle tears past, the
 * remains break up and drop instead of hanging in mid-air.
 */
function finalSweep() {
  const blocks = P.blocks.filter((b) => b.plugin.cb2 && b.plugin.cb2.alive);
  blocks.sort((a, b) => a.position.x - b.position.x);

  // Break left-to-right so the collapse reads as a cascade, with just enough
  // of a downward push that the pieces fall rather than blast away.
  blocks.forEach((b, i) => {
    after(i * 14, () => {
      if (!b.plugin || !b.plugin.cb2 || !b.plugin.cb2.alive) return;
      P.shatter(
        b,
        { x: (Math.random() - 0.35) * 1.4, y: 0.4 + Math.random() * 1.2 },
        (Math.random() - 0.5) * 0.3
      );
      if (!render) return;
      render.dust(b.position.x, b.position.y, render.n(3), 3);
      render.shake(2.4);
    });
  });

  // the pigs go out in puffs of smoke as the dust settles
  P.pigs
    .slice()
    .sort((a, b) => a.position.x - b.position.x)
    .forEach((p, i) => after(160 + i * 20, () => P.popPig(p)));
}

/* -------------------------------------------------------------- reset */

function reset() {
  running = false;
  cleanedUp = false;
  E.visible = false;
  E.progress = 0;
  clearTimers();
  E.pos = { x: P0.x, y: P0.y };
}

function dispose() {
  reset();
  render = null;
  onEnd = null;
}


return { eagle, init, start, isRunning, update, reset, dispose };
})();


/* ============================ game/audio.js ============================ */
const audio = (() => {
/* ==========================================================================
   Code Bounty 2.0 — audio.js
   --------------------------------------------------------------------------
   Three tracks, played as one chain that runs alongside the level:

     1. sound-can.mp3     starts the instant the sardine can leaves the
                          slingshot
     2. sound-eagle.mp3   starts when sound-can.mp3 ends
     3. sound-flyby.mp3   starts when sound-eagle.mp3 ends — the same beat on
                          which the Mighty Eagle flies in

   So the cue chain *drives* the eagle's entrance (see onEagleCueEnd in
   engine.js). That is only safe because of two guards:

     • if a file is missing, empty or undecodable it is skipped and the chain
       moves straight on, so a bad asset can never freeze the level
     • if audio is muted, or the files never arrive, isDrivingEagle() returns
       false and engine.js falls back to the normal impact → eagle timer
   ========================================================================== */

const NAMES = ['can', 'eagle', 'flyby'];

let cfg = null;
let hooks = {};
let actx = null;
let master = null;

const buffers = {}; // name -> AudioBuffer
const loading = {}; // name -> bool
const failed = {}; // name -> bool
const waiters = {}; // name -> [resolve]

let current = null; // { name, src, gain }
let token = 0; // bumped on every stop, so a superseded source stays quiet
let chainArmed = false;
let lastError = null;

/** Live flag: true when the visitor wants sound. */
let enabled = true;

/** Timers/listeners registered on the window so dispose() can undo them. */
const unlocks = [];
const owned = { init: false };

/* ---------------------------------------------------------------- init */

/**
 * @param {object} config  the whole CONFIG (we read CONFIG.audio)
 * @param {object} [cb]    { onEagleCueEnd: fn } — fired when sound-eagle ends
 */
function init(config, callbacks) {
  cfg = config;
  hooks = callbacks || {};
  if (owned.init) dispose();

  if (!cfg || !cfg.audio) {
    console.warn('[CB2] audio disabled: CONFIG.audio missing');
    return;
  }
  owned.init = true;

  try {
    const saved = localStorage.getItem(cfg.audio.storageKey);
    enabled = saved === null ? cfg.audio.enabledByDefault : saved === 'on';
  } catch {
    enabled = cfg.audio.enabledByDefault;
  }

  // The first real gesture anywhere unlocks audio. Until then the context
  // stays suspended and nothing is ever audible.
  const unlock = () => {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });
  unlocks.push(
    ['pointerdown', unlock],
    ['keydown', unlock],
    ['touchstart', unlock]
  );

  NAMES.forEach(load);
}

function ensure() {
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    lastError = 'no AudioContext constructor';
    return null;
  }
  try {
    actx = new AC();
    master = actx.createGain();
    const vol = cfg && cfg.audio ? cfg.audio.volume : 0.8;
    master.gain.value = typeof vol === 'number' ? vol : 0.8;
    master.connect(actx.destination);
    lastError = null;
  } catch (err) {
    lastError = 'ensure(): ' + (err && err.name) + ' ' + (err && err.message);
    console.warn('[CB2] audio unavailable —', lastError);
    actx = null;
  }
  return actx;
}

/* ---------------------------------------------------------------- load */

const srcOf = (name) => (cfg && cfg.audio ? cfg.audio.cues[name] : null);

function load(name) {
  if (buffers[name] || loading[name] || failed[name]) return;
  const c = ensure();
  if (!c) {
    failed[name] = true;
    console.warn('[CB2] audio cue unavailable:', srcOf(name), '—', lastError || 'no AudioContext');
    flush(name, false);
    return;
  }
  loading[name] = true;

  fetch(srcOf(name))
    .then((r) => {
      if (!r.ok) throw new Error(r.status + ' ' + srcOf(name));
      return r.arrayBuffer();
    })
    .then((data) => {
      if (!data.byteLength) throw new Error('empty file (' + srcOf(name) + ')');
      return new Promise((resolve, reject) => {
        // callback form works everywhere; the promise form is the modern one
        const p = c.decodeAudioData(data, resolve, reject);
        if (p && p.then) p.then(resolve, reject);
      });
    })
    .then((buf) => {
      loading[name] = false;
      buffers[name] = buf;
      flush(name, true);
    })
    .catch((err) => {
      loading[name] = false;
      failed[name] = true;
      lastError = srcOf(name) + ' — ' + (err && (err.message || err.name));
      console.warn('[CB2] audio cue unavailable:', lastError);
      flush(name, false);
    });
}

function flush(name, ok) {
  const list = waiters[name];
  if (!list) return;
  delete waiters[name];
  list.forEach((fn) => fn(ok));
}

/** Resolves true when the named cue is decoded, false if it never will be. */
function ready(name) {
  if (buffers[name]) return Promise.resolve(true);
  if (failed[name]) return Promise.resolve(false);
  load(name);
  return new Promise((res) => {
    waiters[name] = waiters[name] || [];
    waiters[name].push(res);
  });
}

/* --------------------------------------------------------------- play */

function stop(fadeSeconds) {
  token++; // invalidate the in-flight source's onended
  if (!current) return;
  const s = current;
  current = null;
  const fade = Math.max(0, fadeSeconds === undefined ? 0 : fadeSeconds);

  try {
    if (!fade || !actx) {
      s.src.onended = null;
      s.src.stop();
      return;
    }
    const t = actx.currentTime;
    s.gain.gain.setValueAtTime(s.gain.gain.value, t);
    s.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    s.src.onended = () => {
      try {
        s.gain.disconnect();
        s.src.disconnect();
      } catch {
        /* ignore */
      }
    };
    s.src.stop(t + fade + 0.02);
  } catch {
    /* already stopped */
  }
}

/**
 * Play one cue. `onEnded` runs on its natural end (never on a manual stop).
 * Returns false when it cannot play at all.
 */
function play(name, onEnded) {
  const b = buffers[name];
  if (!b || !enabled) return false;
  const c = ensure();
  if (!c) return false;
  if (c.state === 'suspended') c.resume();

  stop(0);

  const node = c.createBufferSource();
  node.buffer = b;
  const g = c.createGain();
  g.gain.value = 1;
  node.connect(g);
  g.connect(master);

  const mine = ++token;
  node.onended = () => {
    if (mine !== token) return; // superseded by a stop or a newer cue
    current = null;
    if (onEnded) onEnded();
  };
  node.start(0);
  current = { name, src: node, gain: g };
  return true;
}

/**
 * Play a list of cues back on back, then call `done`. A cue that cannot play
 * (missing, empty, muted) is skipped so the chain always completes.
 */
function sequence(names, done) {
  let i = 0;
  const step = () => {
    if (i >= names.length) {
      if (done) done();
      return;
    }
    const name = names[i++];
    if (!enabled || failed[name]) {
      step();
      return;
    }
    ready(name).then((ok) => {
      if (!ok || !enabled) {
        step();
        return;
      }
      play(name, step);
    });
  };
  step();
}

/* --------------------------------------------------------- the chain */

/**
 * The can leaves the slingshot: sound-can → sound-eagle → (eagle flies in).
 * @param {Function} [onFlyIn] called when sound-eagle ends; the eagle enters
 *                            on that same beat
 */
function playCan(onFlyIn) {
  stop(0);
  chainArmed = enabled && !failed.can && !failed.eagle;
  if (!chainArmed) {
    // Muted (or a cue is unavailable): do NOT call onFlyIn here. The engine's
    // own impact timer brings the eagle in, so muting never fires it early and
    // never suppresses it.
    return true;
  }
  sequence(['can', 'eagle'], () => {
    chainArmed = false;
    // Muted mid-chain: the engine's onSoundDisabled path owns the eagle now, so
    // do not start it here from a chain that was cut short.
    if (!enabled) return;
    if (onFlyIn) onFlyIn();
    if (hooks.onEagleCueEnd) hooks.onEagleCueEnd();
  });
  return true;
}

/** The Mighty Eagle enters — call from startEagle(). */
function playFlyby() {
  if (!enabled || failed.flyby) return false;
  ready('flyby').then((ok) => {
    if (ok && enabled) play('flyby');
  });
  return true;
}

/**
 * True while the cue chain is going to call onEagleCueEnd. engine.js uses this
 * to decide between "wait for the music" and the plain impact timer.
 */
const isDrivingEagle = () => chainArmed && enabled;

function stopAll(fadeSeconds) {
  chainArmed = false;
  NAMES.forEach((n) => {
    if (waiters[n]) flush(n, !!buffers[n]);
  });
  stop(fadeSeconds === undefined ? (cfg && cfg.audio ? cfg.audio.stopFade : 0.2) : fadeSeconds);
}

const isPlaying = () => !!current;
const currentCue = () => (current ? current.name : null);

/* -------------------------------------------------------------- toggle */

function toggle() {
  enabled = !enabled;
  if (!enabled) {
    stopAll(0.08);
    // Let the engine shorten any pending "wait for the music" eagle fallback.
    if (hooks.onSoundDisabled) hooks.onSoundDisabled();
  }
  try {
    localStorage.setItem(cfg.audio.storageKey, enabled ? 'on' : 'off');
  } catch {
    /* private mode */
  }
  if (enabled) ensure();
  return enabled;
}

const isReady = () => !!buffers.can;

function cueStatus() {
  const o = {};
  NAMES.forEach((n) => {
    o[n] = buffers[n]
      ? { state: 'ready', seconds: +buffers[n].duration.toFixed(2) }
      : failed[n]
        ? { state: 'failed', src: srcOf(n) }
        : { state: loading[n] ? 'loading' : 'idle', src: srcOf(n) };
  });
  o._error = lastError;
  o._context = actx ? actx.state : 'none';
  return o;
}

/** Print the cue table to the console — handy when swapping the mp3s. */
function diagnose() {
  const s = cueStatus();
  console.info('[CB2] audio cues', s);
  return s;
}

/** React unmount / StrictMode double-invoke: undo every global listener. */
function dispose() {
  owned.init = false;
  unlocks.forEach(([type, fn]) => window.removeEventListener(type, fn));
  unlocks.length = 0;
  stopAll(0);
  hooks = {};
  Object.keys(buffers).forEach((k) => delete buffers[k]);
  Object.keys(failed).forEach((k) => delete failed[k]);
  Object.keys(loading).forEach((k) => delete loading[k]);
  Object.keys(waiters).forEach((k) => {
    flush(k, false);
    delete waiters[k];
  });
  if (actx) {
    actx.close().catch(() => {});
    actx = null;
    master = null;
  }
  chainArmed = false;
  lastError = null;
}


return { get enabled() { return enabled; }, init, playCan, playFlyby, isDrivingEagle, stopAll, isPlaying, currentCue, toggle, isReady, cueStatus, diagnose, dispose };
})();


/* ============================ game/engine.js ============================ */
const engine = (() => {
/* ==========================================================================
   Code Bounty 2.0 — engine.js
   --------------------------------------------------------------------------
   Boot + the state machine that runs the whole experience:

     intro → level ready → (drag → aim → release) → flight → impact
           → mighty eagle → reveal → CTA

   The interaction is always optional: an idle timer plays the level for you,
   SKIP INTERACTION jumps straight to the shot, and the eagle finishes the job.

   The engine is created imperatively by a React effect and hands its UI state
   back up through callbacks, because React owns the DOM (buttons, HUD, sound
   toggle) while this module owns the canvas and the Matter world.

     const game = createEngine({
       canvas,
       onLevelReady, onHint, onCta, onState
     });
     // …later:
     game.destroy();

   destroy() is mandatory, not optional: React StrictMode mounts effects twice
   in development, and a second Matter world + rAF loop would leak.
   ========================================================================== */


/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {boolean} [opts.reduced]  overrides the prefers-reduced-motion probe
 * @param {Function} [opts.onLevelReady] intro finished, the level is playable
 * @param {Function} [opts.onHint]        (visible:boolean)
 * @param {Function} [opts.onCta]         (visible:boolean)
 * @param {Function} [opts.onState]       (state:string)
 */
function createEngine(opts = {}) {
  const canvas = opts.canvas;
  if (!canvas) throw new Error('createEngine: a canvas is required');

  const params = new URLSearchParams(window.location.search);
  const motionOverride = params.get('motion'); // ?motion=full | ?motion=reduce
  const reduced =
    opts.reduced !== undefined
      ? !!opts.reduced
      : motionOverride
        ? motionOverride === 'reduce'
        : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const guides = /[?&]guides=1/.test(window.location.search);
  const bgMode = params.get('bg') || ''; // ?bg=off | ?bg=full

  const cfg = CONFIG;

  let level;
  let state = 'boot'; // boot|ready|aiming|flight|impact|eagle|reveal|done
  let lastFrame = 0;
  let hintShown = false;
  let revealProgress = 0;
  let ctaShown = false;
  let running = true;
  let alive = true;
  let lastPan = null;
  let userPanUntil = 0;
  let idleTimer = 0;
  let eagleArmed = false; // the impact → eagle timer is pending
  let eagleTimer = null; // id of the pending impact → eagle setTimeout

  /* ------------------------------------------------------------- timers
     Every setTimeout the engine owns is tracked here so replay()/destroy()
     can cancel the lot. Without this a replay during the reveal would be
     overwritten a moment later by the previous run's pending CTA timer. */
  const timers = new Set();

  function after(ms, fn) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.clear();
  }

  /**
   * Run a callback on the next frame, with a timer as a safety net.
   *
   * requestAnimationFrame does not fire at all in a hidden/background tab, so
   * anything that reveals itself on the next frame (the hint, the CTA) would
   * stay invisible for anyone who switches tabs during the intro.
   */
  function nextFrame(fn) {
    let fired = false;
    const run = () => {
      if (fired || !alive) return;
      fired = true;
      fn();
    };
    requestAnimationFrame(run);
    after(60, run);
  }

  /* -------------------------------------------------------------- hooks */
  /* Impact visuals only — all sound comes from the single cue chain. */
  function physicsHooks() {
    return {
      onBlockDestroyed(body, meta) {
        const p = body.position;
        const power = Math.min(14, 6 + Math.hypot(body.velocity.x, body.velocity.y));
        const n = render.n; // scales bursts down as the particle pool fills
        switch (meta.mat) {
          case 'glass':
            render.shards(p.x, p.y, n(10));
            break;
          case 'stone':
            render.chips(p.x, p.y, 'stone', n(7), power * 0.8);
            render.dust(p.x, p.y, n(2), 3);
            break;
          case 'tnt':
            render.fire(p.x, p.y, n(22), 9);
            break;
          default:
            render.chips(p.x, p.y, 'wood', n(8), power);
        }
        // the Mighty Eagle kicks up a white dust puff the moment it touches a
        // block — and in its wake — so every piece it breaks gets the effect
        if (state === 'eagle') render.dust(p.x, p.y, n(4), 4);
        render.shake(1.6);
        updateRevealProgress();
      },

      onExplosion(x, y, radius) {
        const n = render.n;
        render.fire(x, y, n(26), radius * 0.09);
        render.smoke(x, y, n(14), radius * 0.22);
        render.sparks(x, y, n(14), 0, -1);
        render.shake(13);
      },

      onPigPop(x, y, r) {
        const n = render.n;
        render.smoke(x, y, n(9), r * 1.1);
        render.sparks(x, y, n(6), 0, -1);
      },

      onThud(x, y, power) {
        render.dust(x, y, render.n(2 + power * 5), 2 + power * 4);
        render.shake(1 + power * 3);
      },

      onImpact(x, y, speed) {
        if (state === 'flight') state = 'impact';
        render.dust(x, y, render.n(8), 5);
        render.shake(Math.min(18, 5 + speed * 0.7));
        scheduleEagle();
      }
    };
  }

  /* -------------------------------------------------------- reveal math */
  function updateRevealProgress() {
    const total = Math.max(1, P.stats.total);
    revealProgress = Math.min(1, P.stats.destroyed / total);
  }

  /* --------------------------------------------------------------- eagle */
  /**
   * The impact arms the eagle. If the cue chain is driving, the music decides
   * the exact moment and this is only a long safety net; otherwise it is the
   * normal impact → eagle delay.
   */
  function scheduleEagle() {
    if (eagleArmed || state === 'eagle' || state === 'reveal' || state === 'done') return;
    eagleArmed = true;
    eagleTimer = after(
      audio.isDrivingEagle() ? cfg.audio.eagleFallbackMs : reduced ? 120 : cfg.timing.impactToEagle,
      startEagle
    );
  }

  /**
   * Muting must never suppress the cinematic. While the audio cue chain is
   * driving, the impact arms only a long safety net; if the visitor mutes in
   * that window the chain stops, so shorten the wait to the normal impact delay
   * and let the eagle fly in anyway.
   */
  function onSoundDisabled() {
    if (!eagleArmed || state === 'eagle' || state === 'reveal' || state === 'done') return;
    if (eagleTimer != null) {
      clearTimeout(eagleTimer);
      timers.delete(eagleTimer);
    }
    eagleTimer = after(reduced ? 120 : cfg.timing.impactToEagle, startEagle);
  }

  function startEagle() {
    if (state === 'eagle' || state === 'reveal' || state === 'done') return;
    eagleArmed = false;
    if (eagleTimer != null) {
      clearTimeout(eagleTimer);
      timers.delete(eagleTimer);
      eagleTimer = null;
    }
    state = 'eagle';
    setHint(false);
    P.setTimeScale(cfg.physics.slowMoEagle);
    eagle.start();
    audio.playFlyby(); // the eagle is on screen — this is its cue
    if (opts.onState) opts.onState(state);
  }

  function onEagleEnd() {
    P.setTimeScale(1);
    if (cfg.audio.stopFlybyOnEagleExit) audio.stopAll(0.4);
    // let the last pieces settle, then reveal
    after(reduced ? 100 : 900, finishReveal);
  }

  function finishReveal() {
    if (state === 'reveal' || state === 'done') return;
    state = 'reveal';
    updateRevealProgress();
    revealProgress = 1;
    userPanUntil = 0;
    const focus = render.revealFocus();
    render.lookAt(focus.x, focus.y, cfg.camera.zoomIdle);
    render.shake(6);
    if (opts.onState) opts.onState(state);
    if (reduced) showCTA();
    else after(cfg.timing.revealHold, showCTA);
  }

  function showCTA() {
    if (ctaShown) return;
    ctaShown = true;
    state = 'done';
    nextFrame(() => {
      if (opts.onCta) opts.onCta(true);
    });
    if (opts.onState) opts.onState(state);
  }

  function setHint(visible) {
    if (!opts.onHint) return;
    if (visible) nextFrame(() => opts.onHint(true));
    else opts.onHint(false);
  }

  /* ------------------------------------------------------- skip / replay */
  function skipPlay() {
    if (state === 'eagle' || state === 'reveal' || state === 'done') return;
    if (sling.isIdle()) {
      // fast-forward the shot, then let the eagle finish the job
      const shot = sling.solveAuto(Math.floor((level.towers.length - 1) / 2));
      sling.sling.state = 'spent';
      sling.sling.visible = false;
      sling.sling.aim = null;
      state = 'flight';
      setHint(false);
      hintShown = true;
      // launch along the solved arc so the can actually lands on the sculpture
      if (shot) P.launch(shot.x, shot.y, shot.vx, shot.vy);
      audio.playCan(startEagle); // same moment the can would have been released
      scheduleEagle();
    } else {
      startEagle();
    }
    if (opts.onState) opts.onState(state);
  }

  function replay() {
    clearTimers();
    eagleArmed = false;
    eagleTimer = null;
    eagle.reset(); // also cancels its own wind-trail timers
    P.reset();
    P.setTimeScale(1);
    audio.stopAll(0.15);
    render.particles.length = 0;
    render.resetCamera();
    sling.reset();
    ctaShown = false;
    revealProgress = 0;
    state = 'ready';
    hintShown = false;
    idleTimer = 0;
    userPanUntil = 0;
    setHint(false);
    nextFrame(() => {
      if (opts.onCta) opts.onCta(false);
    });
    if (opts.onState) opts.onState(state);
  }

  /** Called by React when the intro overlay finishes (or is skipped). */
  function startLevel() {
    if (state !== 'boot') return;
    state = 'ready';
    idleTimer = 0;
    render.resetCamera();
    if (opts.onState) opts.onState(state);
    if (opts.onLevelReady) opts.onLevelReady();
  }

  /* ---------------------------------------------------------------- loop */
  function frame(now) {
    if (!alive || !running) return;
    const dt = Math.min(48, now - lastFrame || 16.667);
    lastFrame = now;

    // 1. input state
    sling.update(dt);

    // 2. physics (fixed 1/60 s steps driven by real frame time)
    if (state !== 'ready') P.step(dt);

    // 3. eagle cinematic
    if (state === 'eagle') {
      eagle.update(dt);
      followEagle();
    }

    // 4. camera
    followProjectile();

    // 5. draw
    try {
      render.frame(now, dt);
    } catch {
      // never stop the game on a single-frame draw error
    }

    // 6. idle auto-play
    tickIdle(dt);

    requestAnimationFrame(frame);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function followProjectile() {
    if (performance.now() < userPanUntil) return; // user is panning by hand
    if (state === 'flight' && P.projectile) {
      const b = P.projectile.position;
      const tx = cfg.world.w / 2 + (b.x - cfg.world.w / 2) * 0.55;
      const ty = cfg.world.h / 2 + (b.y - cfg.world.h / 2) * 0.45;
      render.lookAt(
        clamp(tx, cfg.world.w * 0.28, cfg.world.w * 0.86),
        clamp(ty, cfg.world.h * 0.34, cfg.world.h * 0.66),
        cfg.camera.zoomFollow
      );
    } else if (state === 'impact') {
      render.lookAt(cfg.world.w * 0.64, cfg.world.h * 0.5, cfg.camera.zoomFollow);
    }
  }

  function followEagle() {
    if (performance.now() < userPanUntil) return;
    const E = eagle.eagle;
    render.lookAt(
      clamp(E.pos.x, cfg.world.w * 0.24, cfg.world.w * 0.78),
      clamp(E.pos.y, cfg.world.h * 0.26, cfg.world.h * 0.72),
      cfg.camera.zoomEagle
    );
  }

  function tickIdle(dt) {
    if (state !== 'ready') return;
    idleTimer += dt;

    if (!hintShown && idleTimer > cfg.timing.hintDelay * 1000) {
      hintShown = true;
      setHint(true);
    }

    // The level never plays itself. The can leaves the sling only when the
    // player pulls it back themselves (or presses a button they chose). Left
    // alone, the sculpture just waits here, perfectly still, forever.
  }

  /* ------------------------------------------------------------ listeners */
  const onVisibility = () => {
    if (document.hidden) {
      running = false;
    } else if (!running && alive) {
      running = true;
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    }
  };
  const onResize = () => render.resize();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, { passive: true });

  // The hero canvas is CSS-scaled while the intro hands over to the level, and
  // it is 100%/100% of a flex panel, so a ResizeObserver catches every layout
  // change (including the one the hand-off finishes on) that a window resize
  // listener would miss.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => render.resize()) : null;
  if (ro) ro.observe(canvas);

  /* ---------------------------------------------------------------- boot */

  // audio first: it installs the gesture listeners. onEagleCueEnd fires when
  // sound-eagle.mp3 ends, which is the beat the Mighty Eagle flies in on.
  audio.init(cfg, { onEagleCueEnd: startEagle, onSoundDisabled });

  level = build(cfg);

  // ?fish=art / ?eagle=art compare a drop-in sprite against the built-in art
  if (params.get('fish') === 'art') art.setForceArt('fish', true);
  if (params.get('eagle') === 'art') art.setForceArt('eagle', true);
  art.loadAssets(cfg);

  P.init(cfg, level, physicsHooks());
  render.init(canvas, cfg, level, { reduced, guides, bg: bgMode, sling: sling.sling, eagle: eagle.eagle });
  // ensure correct sizing after mount
  try { render.resize(); } catch { /* ignore */ }
  sling.init(cfg, canvas, level, {
    render,
    onFire(shot) {
      state = 'flight';
      userPanUntil = 0;
      setHint(false);
      hintShown = true;
      audio.playCan(startEagle); // sound-can → sound-eagle → the eagle flies in
      P.launch(shot.x, shot.y, shot.vx, shot.vy);
      if (opts.onState) opts.onState(state);
    },
    onDragChange() {
      if (state === 'ready') {
        state = 'aiming';
        if (opts.onState) opts.onState(state);
      }
    },
    onPanStart(p) {
      lastPan = p;
      userPanUntil = performance.now() + 1600;
    },
    onPan(p) {
      if (!lastPan) return;
      render.panBy(p.x - lastPan.x, p.y - lastPan.y);
      lastPan = p;
      userPanUntil = performance.now() + 1600;
    },
    onPanEnd() {
      lastPan = null;
    }
  });
  eagle.init(cfg, { render, onEnd: onEagleEnd });

  // optional tower reference overlay
  if (guides) {
    art.loadTowerGuide(cfg).then((img) => {
      if (img && alive) render.setTowerGuide(img);
    });
  }

  // watchdog: if the can never hits anything, still bring the eagle in
  after(2600, () => {
    if (state === 'flight' || state === 'impact') scheduleEagle();
  });

  lastFrame = performance.now();
  requestAnimationFrame(frame);

  /* ----------------------------------------------------------------- api */
  const api = {
    /** intro finished (or was skipped) — the level is now playable */
    startLevel,
    /** "SKIP INTERACTION →" */
    skipPlay,
    /** reset the level to its opening state */
    replay,
    /** React unmount / StrictMode: stop everything, release everything */
    destroy() {
      alive = false;
      running = false;
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize);
      if (ro) ro.disconnect();
      sling.dispose();
      eagle.dispose();
      P.dispose();
      audio.dispose();
      art.disposeAssets();
    },
    get state() {
      return state;
    },
    get reduced() {
      return reduced;
    },
    /** 🔊 / 🔇 — icon only in the UI, this just flips the flag. */
    toggleSound() {
      return audio.toggle();
    },
    get soundOn() {
      return audio.enabled;
    },
    /** Print the audio cue table (decoded durations / failures) to the console. */
    diagnoseAudio() {
      return audio.diagnose();
    },
    stats() {
      return {
        state,
        destroyed: P.stats.destroyed,
        total: P.stats.total,
        gPx: P.gPx,
        blocks: P.blocks.length,
        debris: P.debris.length,
        pigs: P.pigs.length,
        particles: render.particles.length,
        reveal: revealProgress,
        cue: audio.currentCue(),
        drivingEagle: audio.isDrivingEagle(),
        sound: audio.enabled
      };
    }
  };

  // Open the page with ?debug=1 to reach the live engine from the console
  // (window.__cb2). Handy for checking block/debris state during the run.
  if (typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search)) {
    window.__cb2 = { api, P, render, sling, eagle, audio, level };
  }
  return api;
}


return { createEngine };
})();

const createEngine = engine.createEngine;

/* ======================== hooks/useReducedMotion.js ======================== */
/* ==========================================================================
   useReducedMotion.js
   --------------------------------------------------------------------------
   One source of truth for "should we animate?":

     • honours the OS setting (prefers-reduced-motion: reduce)
     • ?motion=reduce forces it on, ?motion=full forces it off — handy for
       checking the cinematic on a machine that has motion turned down

   The value is handed to both the intro gate and the game engine so they can
   never disagree.
   ========================================================================== */


function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    const override = new URLSearchParams(window.location.search).get('motion');
    if (override) return override === 'reduce';
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get('motion');
    if (override) return undefined; // pinned by the URL — do not follow the OS

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}


/* ======================= hooks/useHorizontalScroll.js ====================== */
/* ==========================================================================
   useHorizontalScroll.js
   --------------------------------------------------------------------------
   The site only ever scrolls LEFT → RIGHT. There is no vertical fallback at
   any viewport width.

   A vertical wheel gesture — the natural one on a mouse — becomes horizontal
   travel, so the strip glides from the home page onto the blank page like a
   normal scroll. Arrow keys / PageUp / PageDown / Home / End still step one
   panel at a time, and keyboard focus pulls the strip to its panel.
   ========================================================================== */


/**
 * @param {object}  opts
 * @param {boolean} opts.reduced  jump instantly instead of smooth-scrolling
 * @returns {{ scrollerRef: React.RefObject<HTMLElement|null>,
 *             scroller: HTMLElement|null,
 *             goTo: (index:number, instant?:boolean) => void }}
 */
function useHorizontalScroll({ reduced = false } = {}) {
  const scrollerRef = useRef(null);
  const trackRef = useRef(null);
  const currentRef = useRef(-1);

  const panelCount = useCallback(() => {
    const track = trackRef.current;
    return track ? track.querySelectorAll('.panel').length : 0;
  }, []);

  const panelWidth = useCallback(() => scrollerRef.current?.clientWidth || 1, []);

  const goTo = useCallback(
    (index, instant) => {
      const el = scrollerRef.current;
      if (!el) return;
      const i = Math.max(0, Math.min(panelCount() - 1, index));
      if (i < 0) return;
      el.scrollTo({ left: i * panelWidth(), behavior: instant || reduced ? 'auto' : 'smooth' });
      currentRef.current = i;
    },
    [panelCount, panelWidth, reduced]
  );

  const activeIndex = useCallback(
    () => Math.max(0, Math.min(panelCount() - 1, Math.round((scrollerRef.current?.scrollLeft || 0) / panelWidth()))),
    [panelCount, panelWidth]
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return undefined;

    /* ------------------------------------------------------- the wheel
       Turn the raw wheel delta into horizontal travel. Scrolling by the
       delta (rather than jumping a whole panel) is what makes the transition
       from the home page to the blank page read as a scroll. `behavior: auto`
       keeps each tick crisp and lets the deltas accumulate. */
    const onWheel = (e) => {
      if (e.ctrlKey) return; // pinch zoom
      // prefer real horizontal intent, otherwise take the vertical wheel
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      scroller.scrollBy({ left: d, behavior: 'auto' });
    };

    const onKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const last = panelCount() - 1;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') goTo(activeIndex() + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(activeIndex() - 1);
      else if (e.key === 'Home') goTo(0);
      else if (e.key === 'End') goTo(last);
      else return;
      e.preventDefault();
    };

    // keyboard focus should follow the active panel
    const onFocusIn = (e) => {
      const panel = e.target?.closest?.('.panel');
      if (!panel) return;
      const i = Array.prototype.indexOf.call(track.querySelectorAll('.panel'), panel);
      if (i >= 0 && i !== activeIndex()) goTo(i);
    };

    // keep the strip pinned to a whole number of viewports
    const onResize = () => goTo(activeIndex(), true);

    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('focusin', onFocusIn);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    return () => {
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [activeIndex, goTo, panelCount]);

  return { scrollerRef, trackRef, goTo, reduced };
}


/* ============================ hooks/useGame.js ============================= */
/* ==========================================================================
   useGame.js
   --------------------------------------------------------------------------
   The bridge between React and the imperative engine.

   React owns every piece of DOM the visitor can click or read (the drag hint,
   the CTA, the sound toggle), so the engine *pushes* its UI state up through
   callbacks instead of reaching into the document itself.

   The engine is created once the hero canvas is in the tree and destroyed when
   it leaves. destroy() is not optional: React StrictMode mounts effects twice
   in development, and a second Matter world + rAF loop would leak.

   @param {HTMLCanvasElement|null} canvas
   @param {boolean} reduced
   ========================================================================== */


const { storageKey: SOUND_KEY, enabledByDefault: SOUND_DEFAULT } = CONFIG.audio;

/**
 * Read the stored sound preference so the toggle never flashes the wrong icon.
 *
 * This mirrors exactly what src/game/audio.js does on init, so the icon that
 * renders before the engine exists already agrees with it.
 */
function readSoundPref() {
  try {
    const saved = localStorage.getItem(SOUND_KEY);
    if (saved === 'on') return true;
    if (saved === 'off') return false;
  } catch {
    /* private mode */
  }
  return SOUND_DEFAULT;
}

function useGame(canvas, reduced) {
  const engineRef = useRef(null);
  /*
    The intro can finish before the canvas is in the tree — when the cutscene
    has already been seen this session, "skip it" resolves on the very first
    commit, before the hero's callback ref has even run. So remember the hand
    -over and apply it the moment the engine exists.
  */
  const startPendingRef = useRef(false);

  const [levelReady, setLevelReady] = useState(false);
  const levelReadyRef = useRef(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(readSoundPref);
  const [state, setState] = useState('boot');

  useEffect(() => {
    if (!canvas) return undefined;

    const engine = createEngine({
      canvas,
      reduced,
      onLevelReady: () => {
        if (!levelReadyRef.current) {
          levelReadyRef.current = true;
          setLevelReady(true);
          setTimeout(() => {
            try {
              const eng = engineRef.current;
              if (eng && eng.render && eng.render.resize) {
                eng.render.resize();
                requestAnimationFrame(() => eng.render.resize());
              }
            } catch { /* ignore */ }
          }, 0);
          setTimeout(() => {
            try {
              const eng = engineRef.current;
              if (eng && eng.render && eng.render.resize) eng.render.resize();
            } catch { /* ignore */ }
          }, 120);
        }
      },
      onHint: (v) => setHintVisible(v),
      onCta: (v) => setCtaVisible(v),
      onState: (s) => setState(s)
    });

    engineRef.current = engine;
    // Boot engine immediately
    try {
      const r = engine.render;
      if (r && r.resize) {
        r.resize();
        requestAnimationFrame(() => r.resize());
        setTimeout(() => r.resize(), 20);
        setTimeout(() => r.resize(), 60);
        setTimeout(() => r.resize(), 120);
        setTimeout(() => r.resize(), 240);
      }
    } catch { /* ignore */ }
    if (startPendingRef.current) {
      engine.startLevel();
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [canvas, reduced]);

  /* ----------------------------------------------------------------- api */

  const startLevel = useCallback(() => {
    startPendingRef.current = true;
    const eng = engineRef.current;
    if (eng) {
      eng.startLevel();
      try {
        const r = eng.render;
        if (r && r.resize) {
          r.resize();
          requestAnimationFrame(() => r.resize());
          setTimeout(() => r.resize(), 30);
          setTimeout(() => r.resize(), 80);
          setTimeout(() => r.resize(), 160);
          setTimeout(() => r.resize(), 320);
        }
      } catch { /* ignore */ }
    }
  }, []);

  const skipPlay = useCallback(() => {
    engineRef.current?.skipPlay();
  }, []);

  const replay = useCallback(() => {
    engineRef.current?.replay();
  }, []);

  const toggleSound = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setSoundOn(engine.toggleSound());
  }, []);

  return {
    levelReady,
    hintVisible,
    ctaVisible,
    soundOn,
    state,
    startLevel,
    skipPlay,
    replay,
    toggleSound,
    stats: engineRef
  };
}


/* ======================== components/SoundToggle.jsx ======================= */
/* ==========================================================================
   SoundToggle.jsx
   --------------------------------------------------------------------------
   The one control that survives the cut-down: sound on / off. Icon only — no
   visible label, just a tooltip and an sr-only name for screen readers.
   ========================================================================== */

function SoundToggle({ on, onToggle }) {
  return (
    <button
      className={on ? 'sound' : 'sound is-off'}
      type="button"
      aria-pressed={on}
      title={on ? 'Sound on — click to mute' : 'Sound off — click to enable'}
      onClick={onToggle}
    >
      <span className="sound__icon" aria-hidden="true">
        {on ? '🔊' : '🔇'}
      </span>
      <span className="sr-only">Toggle sound</span>
    </button>
  );
}


/* ======================== components/BlankPanel.jsx ======================== */
/* ==========================================================================
   BlankPanel.jsx
   --------------------------------------------------------------------------
   Deliberately empty — a full viewport of nothing, and the reason the site
   scrolls sideways at all.

   Drop the next screen's markup in here, or delete this component and its
   siblings in App.jsx to end the strip at the game.
   ========================================================================== */

function BlankPanel({ id = 'blank', label = 'Next screen' }) {
  return <section className="panel panel--blank" id={id} aria-label={label} />;
}


/* ========================= components/HeroHud.jsx ========================== */
/* ==========================================================================
   HeroHud.jsx
   --------------------------------------------------------------------------
   The overlay on top of the level:

     • LEVEL 01 / THE BOUNTY GATE — the panel's own title. There is no separate
       title card; the game screen *is* "the bounty gate"
     • the drag hint + SKIP INTERACTION, which the engine raises on its own
       after a couple of seconds of inactivity (interaction is always optional)
     • the post-reveal CTA: REPLAY LEVEL

   Both blocks stay mounted and are toggled with .is-in so their enter
   transition can actually play.
   ========================================================================== */

function HeroHud({ hintVisible, ctaVisible, onSkipPlay, onReplay }) {
  return (
    <div className="hud">
      <p className="level-tag">
        <span className="level-tag__key">LEVEL 01</span> THE BOUNTY GATE
      </p>

      <div className={hintVisible ? 'hint is-in' : 'hint'} aria-hidden={!hintVisible}>
        <p className="hint__bubble">
          <span className="hint__text">Drag the sardine can backwards</span>{' '}
          <span className="hint__arrow" aria-hidden="true">
            →
          </span>
        </p>
        <button className="btn btn--ghost btn--sm" type="button" tabIndex={hintVisible ? 0 : -1} onClick={onSkipPlay}>
          SKIP INTERACTION →
        </button>
      </div>

      <div className={ctaVisible ? 'hero-cta is-in' : 'hero-cta'} aria-live="polite" aria-hidden={!ctaVisible}>
        <div className="hero-cta__row">
          <button className="btn btn--ghost" type="button" tabIndex={ctaVisible ? 0 : -1} onClick={onReplay}>
            ↺ REPLAY LEVEL
          </button>
        </div>
      </div>
    </div>
  );
}


/* ======================== components/HeroPanel.jsx ========================= */
/* ==========================================================================
   HeroPanel.jsx
   --------------------------------------------------------------------------
   The home page: the level itself, full-bleed, with the HUD on top.

   The canvas is the engine's whole world — a 1920x1080 design resolution that
   is scaled to fit, so the slingshot, the sardine can and every letter of
   "CODE BOUNTY 2.0" are always on screen together at any viewport size.

   `canvasRef` is a *callback* ref handed down from App: as soon as the canvas
   node exists, App passes it to useGame, which boots the engine. That is why
   the level is already built and ticking behind the intro cutscene.
   ========================================================================== */


function HeroPanel({ canvasRef, hintVisible, ctaVisible, onSkipPlay, onReplay }) {
  return (
    <section className="panel panel--hero" id="hero" aria-label="Interactive game level">
      <div className="world-layer">
        <canvas
          ref={canvasRef}
          className="stage"
          tabIndex={0}
          aria-label="Interactive slingshot level. Drag the sardine can backwards and release to fire, or press the skip button to jump straight to the reveal."
        />
      </div>

      <HeroHud hintVisible={hintVisible} ctaVisible={ctaVisible} onSkipPlay={onSkipPlay} onReplay={onReplay} />
    </section>
  );
}


/* ==================== components/HorizontalScroller.jsx ==================== */
/* ==========================================================================
   HorizontalScroller.jsx
   --------------------------------------------------------------------------
   The whole site: a horizontal strip of full-viewport panels.

   There is no nav bar, no section links, no progress bar and no SCROLL cue —
   the track simply moves left → right. All of the gesture handling lives in
   useHorizontalScroll.js.
   ========================================================================== */


function HorizontalScroller({ reduced = false, children }) {
  const { scrollerRef, trackRef } = useHorizontalScroll({ reduced });

  return (
    <div className="scroller" ref={scrollerRef} tabIndex={-1}>
      <div className="track" ref={trackRef}>
        {children}
      </div>
    </div>
  );
}


/* ====================== components/IntroOverlay.jsx ======================== */
/* ==========================================================================
   IntroOverlay.jsx
   --------------------------------------------------------------------------
   The intro *cutscene*: assets/intro-scene.mp4 plays full-bleed behind a light
   scrim with a yellow SKIP button bottom-right, then it fades/zooms straight
   into the level — no hard cut, and no logo animation / word assembly /
   tagline / loading bar on the way.

   The video carries its own timing, so this component mostly has to:
     • play it muted + inline so autoplay is allowed everywhere
     • finish on SKIP, on the video's own end, or after CONFIG.intro.duration
     • play on every load / reload of the home page
     • hand over to the level *immediately* so the two zoom together while the
       overlay is still fading
   ========================================================================== */


const CLIP = assetUrl('intro-scene.mp4');

function markSeen() {
  try {
    sessionStorage.setItem(CONFIG.intro.rememberKey, '1');
  } catch {
    /* private mode — the intro simply plays again next visit */
  }
}

/**
 * Grab the first decoded frame and use it as the poster, so there is always
 * something to look at even when the clip refuses to start (see tryPlay).
 */
function freezePoster(v) {
  if (v.dataset.posterDone) return;
  try {
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 2;
    c.height = v.videoHeight || 2;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    v.poster = c.toDataURL('image/jpeg', 0.7);
  } catch {
    /* tainted / cross-origin clip — the element keeps its own first frame */
  }
  v.dataset.posterDone = '1';
}

/**
 * The cutscene plays on every load / reload of the home page, as requested.
 * (`?intro=1` is kept for parity but is now redundant.)
 */
function shouldPlay() {
  return true;
}

function IntroOverlay({ reduced = false, onDone }) {
  const videoRef = useRef(null);
  const onDoneRef = useRef(onDone);

  // Keep the callback fresh without re-running the cutscene effect.
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const doneRef = useRef(false);
  const startedRef = useRef(false);

  const [open, setOpen] = useState(() => shouldPlay(reduced));
  const [leaving, setLeaving] = useState(false);
  const [instant, setInstant] = useState(false);
  const [skipVisible, setSkipVisible] = useState(false);

  const finish = useCallback((instantExit) => {
    if (doneRef.current) return;
    doneRef.current = true;
    markSeen();
    setInstant(!!instantExit);
    setLeaving(true);
    try {
      videoRef.current?.pause();
    } catch {
      /* ignore */
    }
    /*
      Hand over straight away. The overlay is still fading (and scaling) out on
      top of the level zooming in, which is what makes the two read as one
      continuous move rather than a cut.
    */
    onDoneRef.current?.(!!instantExit);
    window.setTimeout(() => setOpen(false), instantExit ? 420 : 820);
  }, []);

  /* ---- "we are not playing it" — already seen, or reduced motion ------- */
  useEffect(() => {
    if (open) return;
    if (doneRef.current) return;
    doneRef.current = true;
    markSeen();
    onDoneRef.current?.(true);
  }, [open]);

  /* ---- the clip itself ------------------------------------------------- */
  useEffect(() => {
    if (!open) return undefined;

    const video = videoRef.current;
    const timers = [];
    const listeners = [];

    const on = (target, type, fn, opts) => {
      if (!target) return;
      target.addEventListener(type, fn, opts);
      listeners.push([target, type, fn, opts]);
    };
    const later = (ms, fn) => timers.push(window.setTimeout(fn, ms));

    /** Show the SKIP button almost immediately so it is always reachable. */
    later(120, () => setSkipVisible(true));

    if (video) {
      video.muted = true; // required for autoplay in every browser
      video.volume = 0;
      video.playsInline = true;

      on(video, 'ended', () => finish(false));
      on(video, 'error', () => {
        console.info('[CB2] intro cutscene unavailable, skipping it');
        finish(true);
      });
      on(video, 'loadeddata', () => freezePoster(video));

      /*
        Start the clip, tolerating refusal.

        Chrome pauses *video-only* media (an mp4 with no audio track) whenever
        the tab is hidden or the window is occluded, and rejects play() with an
        AbortError. That is not fatal — it resolves itself the moment the page
        is visible — so we retry on visibilitychange and on the first
        interaction instead of bailing out and flashing a black screen.
      */
      const tryPlay = () => {
        if (doneRef.current || !video || startedRef.current) return;
        let p;
        try {
          p = video.play();
        } catch {
          return; // very old browser: the still frame + SKIP carries the intro
        }
        if (!p || !p.then) {
          startedRef.current = true;
          return;
        }
        p.then(
          () => {
            startedRef.current = true;
          },
          () => {
            /* refused — a later visibilitychange / interaction will retry */
          }
        );
      };

      on(document, 'visibilitychange', () => {
        if (!doneRef.current && !document.hidden) tryPlay();
      });
      ['pointerdown', 'keydown', 'touchstart'].forEach((t) =>
        on(window, t, tryPlay, { once: true, passive: true })
      );

      tryPlay();
    }

    on(window, 'keydown', (e) => {
      if (doneRef.current) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        finish(false);
      }
    });

    // safety net: never let a stuck clip trap the visitor
    later(CONFIG.intro.duration, () => finish(false));

    return () => {
      timers.forEach(clearTimeout);
      listeners.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
      startedRef.current = false;
    };
  }, [open, finish]);

  if (!open) return null;

  const cls = ['intro', leaving ? 'is-leaving' : '', instant ? 'is-instant' : ''].filter(Boolean).join(' ');

  return (
    <div className={cls} role="dialog" aria-label="Code Bounty 2.0 intro cutscene">
      <video
        className="intro__video"
        ref={videoRef}
        src={CLIP}
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />

      <div className="intro__scrim" aria-hidden="true" />

      <button className={`intro__skip${skipVisible ? ' show-skip' : ''}`} type="button" onClick={() => finish(false)}>
        <span>SKIP</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h13M12 6l6 6-6 6" />
        </svg>
      </button>

      <p className="sr-only" aria-live="polite">
        Playing the Code Bounty 2.0 intro cutscene
      </p>
    </div>
  );
}


/* ============================== App component ============================== */
/* ==========================================================================
   App.jsx — Code Bounty 2.0
   --------------------------------------------------------------------------
   The whole site is one intro cutscene and two panels:

     1. the home page — "THE BOUNTY GATE", a playable slingshot level whose
        towers spell CODE BOUNTY 2.0, ending on a reveal + REGISTER/EXPLORE
     2. blank placeholder pages after it

   No nav bar. No section links. No progress bar. No SCROLL cue. The track only
   ever travels left → right.

   React owns the DOM (HUD, CTA, sound toggle, scroller); the canvas and the
   Matter world belong to the imperative engine in src/game/, which is created
   once the canvas is mounted and torn down when it is not.
   ========================================================================== */





function App() {
  const reduced = useReducedMotion();

  /* The hero's canvas, as state: useGame boots the engine once it exists. */
  const [canvas, setCanvas] = useState(null);

  const {
    levelReady,
    hintVisible,
    ctaVisible,
    soundOn,
    startLevel,
    skipPlay,
    replay,
    toggleSound,
  } = useGame(canvas, reduced);

  const handleIntroDone = useCallback(() => {
    startLevel();
  }, [startLevel]);

  return (
    <>
      <IntroOverlay reduced={reduced} onDone={handleIntroDone} />

      <div className={levelReady ? 'app is-ready' : 'app'}>
        <HorizontalScroller reduced={reduced}>
          <HeroPanel
            canvasRef={setCanvas}
            hintVisible={hintVisible}
            ctaVisible={ctaVisible}
            onSkipPlay={skipPlay}
            onReplay={replay}
          />

          {/* Two blank placeholder pages after the home screen. Delete either
              line to shorten the strip. */}
          <BlankPanel />
          <BlankPanel id="blank-2" label="Next screen" />
        </HorizontalScroller>

        <SoundToggle on={soundOn} onToggle={toggleSound} />
      </div>

      <noscript>
        <div className="noscript">Code Bounty 2.0 needs JavaScript for the interactive level. Enable JavaScript to play.</div>
      </noscript>
    </>
  );
}


export default App;
