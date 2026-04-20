Original SVG game assets for the canvas duel prototype.

All files in this directory were authored directly in-repo for this benchmark run.
They are safe to ship in-repo and require no build step, network fetch, or external tooling.

Categories
- `board/` - board background art
- `frames/` - faction card frames
- `portraits/` - hero portraits
- `illustrations/` - card illustration panels
- `sigils/` - faction marks
- `hud/` - HUD icons
- `effects/` - effect sprites

Usage
- Keep paths relative, for example `assets/frames/frame-solar.svg`
- SVG files are sized for direct loading into an `Image()` element or `drawImage` pipeline
- Colors are intentionally consistent across Solar Order and Umbral Grove faction identities
