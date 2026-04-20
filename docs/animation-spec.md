# Visual Polish Animation Spec

This file defines deterministic timing targets for the canvas render loop. Sample every active effect with `timeline.sample(elapsedMs)` and use the returned values directly in WebGL transforms, glow uniforms, text sprites, and shake offsets.

## Always-On Motion

- `idleBreath(timeMs)`
  - Purpose: keep heroes, board ornaments, and highlighted cards alive even when no gameplay action is happening.
  - Output: `{ y, scale }`
  - Recommended use: apply to portrait roots, mana crystals, and the currently suggested tutorial target.

- `cardFanTransform(index, total, width, height)`
  - Purpose: consistent hand layout with a readable center card and slight physical arc.
  - Output: `{ x, y, rotation, lift, tilt }`
  - Recommended use: hand cards should rest on this pose, then add hover lift and cursor parallax on top.

## One-Shot Effects

- `createEffectTimeline('draw', { from, to })`
  - Duration: `560ms`
  - Feel: deck-to-hand flight with scale-up and rotation settle.

- `createEffectTimeline('play', { from, to })`
  - Duration: `680ms`
  - Feel: card leaves hand, surges onto the lane, overshoots slightly, then locks into board placement.

- `createEffectTimeline('attack', { from, to })`
  - Duration: `480ms`
  - Feel: fast lunge, brief impact overshoot, screen shake on hit, then snap back.
  - Important sampled fields: `position`, `impactFlash`, `shake`.

- `createEffectTimeline('death', { origin })`
  - Duration: `620ms`
  - Feel: fall, fade, crumble. Pair with fragment dissolve or alpha-cut shader if available.

- `createEffectTimeline('damage-number', { origin, amount })`
  - Duration: `720ms`
  - Feel: number rises quickly, grows slightly on spawn, then fades to zero before the end of the window.
  - Important sampled fields: `label`, `position`, `opacity`, `scale`.

- `createEffectTimeline('turn-banner', { width, height, text })`
  - Duration: `1280ms`
  - Feel: banner enters from off-screen, centers long enough to read, then exits with trailing glow.
  - Important sampled fields: `position`, `opacity`, `glow`, `text`.

## Integration Notes

- Keep timelines deterministic and data-only. The render loop owns drawing; the animation system owns motion envelopes.
- Stack ambient motion and one-shot effects additively. Example: a card on board can keep breathing while also inheriting `shake` during impact.
- For damage moments, trigger attack, flash, shake, and damage-number timelines together from a single combat event.
- For tutorial guidance, pulse the recommended card by combining `idleBreath()` with a soft outline ramp in the shader.
