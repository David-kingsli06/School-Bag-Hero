# Project Creation & Architecture Prompts: School Bag Hero

This document contains the prompt specifications, architectural requirements, design directives, and progressive optimization prompts used to create and refine the **VARK** full-screen stage-by-stage scroll hero.

---

## 1. Primary Master Prompt

Use this prompt to generate the foundation of the project from scratch:

```markdown
Build a full-screen, stage-by-stage scroll hero for [BRAND NAME], a school backpack with a dark matte finish, two front zippers, and visible stitching. The hero plays a 570-frame image sequence in four stages. Each scroll gesture advances exactly one stage, and the page never scrolls through frames freely. Text sits on the left, the backpack on the right. No poster image. Keep everything calm, slow, and photographic. No bouncing, no overshoot, no playful motion.

### SKILLS TO APPLY
- Taste: sets the visual direction. Palette: warm classroom near-black #14100E for the background, warm off-white #F3EDE3 for all text, [ACCENT COLOR] (#D97736) for the thin accent line, and warm amber #C8843A for secondary text. Never use pure white.
- Impeccable Design: governs layout, typography, and spacing. Use a high-contrast serif for headlines (Cormorant Garamond) and a clean sans for sublines (Inter). Use 8 px spacing steps and side margins of at least 6vw.
- Emil Design Engineering: governs motion and interaction. Use eased, unhurried playback with no snapping and no bounce. Each stage's motion must finish before the next gesture is accepted.
- Conflict rule: Taste wins on color and mood, Impeccable wins on layout and type, and Emil wins on timing. The result must still feel calm.

### STACK
- Next.js 15+ (App Router), TypeScript (strict), Tailwind CSS v4.
- Frame playback on a single <canvas>, no 3D libraries.
- Use GSAP for stage timing and text animation. Justify the choice in two sentences, then use it consistently.

### STAGE MODEL
- The page has four stages. The active stage index is an integer from 0 to 3. Only one stage can be active at a time.
- Scroll is intercepted. One wheel gesture, one touch swipe, or one key press (down arrow or page down) advances the stage index by 1. An upward gesture moves it back by 1. Ignore further input until the current stage's animation has finished, so one gesture moves exactly one stage.
- Stage ranges (frame indices, inclusive):
  - Stage 1, frames 0 to 189: placed and lifted on the desk.
  - Stage 2, frames 190 to 379: the first pocket opens to show pens and markers.
  - Stage 3, frames 380 to 569: the second pocket opens to show a laptop and notebooks.
  - Stage 4: the closing brand reveal. Hold on the last frame, frame 569.
- Playing a stage: when a gesture advances to a new stage, playback runs from the first frame of that stage to its last frame over STAGE_DURATION_SECONDS (7 seconds), using ease-in-out. Playback runs forward for a forward gesture and backward for a reverse gesture. Keep the frame index an integer and draw only whole frames.
- Stage 1 starts on frame 0 when the page loads. Stage 4 holds on frame 569.

### FRAME ASSETS & CANVAS
- Frames live in /public/frames/frame_000.jpg through frame_569.jpg, at 1920x1080.
- Canvas backing store uses DPR capped at 1.5 on desktop and 1.0 on mobile. Do not resize per frame.
- Frame canvas container width is 70% and height is 100% (full screen).
- Draw each frame with object-fit: cover logic, centered, cropped to 104% of the canvas to hide edge artifacts.
- imageSmoothingQuality is "low" during active frame playback, and "high" when the stage settles into a hold.

### TYPOGRAPHY & OVERLAY
- Eyebrow label: 12 px uppercase, letter spacing 0.24em, in accent color (e.g., "01 · PLACEMENT").
- Headline: 64 to 80 px on desktop (serif face, tracking -0.01em), with one word set in italic (Cormorant Garamond italic marked with *word*).
- Subline: 16 to 18 px in warm amber #C8843A.
- Spec row: below the subline, three short facts separated by thin vertical rules (12 px uppercase, #F3EDE3 at 70% opacity).
- Stage counter: top-right, "01 / 04" in sans face, 14 px, letter spacing 0.2em, cross-fades over 400 ms on change.
- Stage indicator: vertical list of four markers on the left edge. The active marker grows to 24 px in accent color; inactive markers are 8 px at 30% opacity.
- 160 px horizontal panel gradient from text background into transparent at the boundary.

### ACCESSIBILITY & PERFORMANCE
- Reduced motion: if prefers-reduced-motion is active, skip playback animation and show text immediately.
- Keyboard navigation (arrows, page keys, space) and touch swipes (threshold 40 px).
```

---

## 2. Refinement & Optimization Prompts

These progressive prompts can be applied to solve specific runtime, memory, and animation challenges:

### A. Memory Management (Sliding Window)
```markdown
Do not decode all 570 frames at once into memory.
Implement an asymmetric forward-biased sliding window: keep the active frame plus 45 frames ahead and 15 frames behind, decoded with createImageBitmap() or img.decode().
Release frames outside the window with ImageBitmap.close() in throttled batches every 8 frames to avoid garbage collection stutter. Preload the next stage's window in advance.
```

### B. Frame-Start Lag & Timing Separation
```markdown
Preload and decode frames before playback begins so the first draw never waits on JPEG decode.
Store the frame index in a ref, not React state. Draw inside requestAnimationFrame only when the integer frame changes.
Start stage text entrance only after the first frame of the stage has drawn to canvas, separating frame updates from text tweens.
```

### C. Blackout / Dissolve Fix at Stage Boundaries
```markdown
Never call ctx.clearRect unless an image is guaranteed to be painted in the exact same synchronous frame.
At stage boundaries (frames 189 <-> 190 and 379 <-> 380), execute a 250 ms crossfade dissolve between the two frames so transitions between shots read as a seamless dissolve rather than an abrupt jump or black flicker.
```

### D. Text Clarity & Filter Scoping
```markdown
Ensure CSS/GSAP blur filters (filter: blur(...)) are restricted strictly to headline words (.anim-word).
Explicitly clear filter ("none") on the eyebrow, subline, accent line, and spec row during all enter/exit transitions so they never remain permanently blurred.
```

---

## 3. Project File Structure

```text
├── app/
│   ├── globals.css           # Tailwind v4 theme tokens & color definitions
│   ├── layout.tsx            # Cormorant Garamond (normal + italic) & Inter fonts
│   └── page.tsx              # Renders the Hero component
├── components/
│   ├── FrameCanvas.tsx       # Canvas engine, sliding window, DPR cap, decode pipeline
│   ├── Hero.tsx              # Master stage controller, RAF time clock, gesture hooks
│   └── HeroOverlay.tsx       # Eyebrow, split-word headline, specs, indicator, counter
├── lib/
│   ├── stages.ts             # Stage data, copy, italics markers, durations, specs
│   └── useReducedMotion.ts   # Client-safe prefers-reduced-motion hook
└── public/
    └── frames/               # frame_000.jpg through frame_569.jpg
```
