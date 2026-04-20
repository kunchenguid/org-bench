# Canvas Input And UX Spec

This spec is for the first playable duel and assumes all gameplay UI lives inside the canvas.

## Core Interaction Model

- Hover or tap preview always answers one question immediately: "what can I do right now?"
- Legal actions glow before the player discovers them. Illegal targets stay visible but desaturate.
- Drag is used only when motion teaches intent better than a click. Play-from-hand and attack targeting should both feel physical.
- Every actionable thing owns a hit region in canvas space so rendering, highlighting, tooltips, and interaction all agree.

## Hover And Tap

- Hand card hover lifts the card, slightly increases scale, and shows rules text in a nearby tooltip panel.
- Board unit hover shows attack and health emphasis plus any keywords.
- Hero hover shows health, armor if present, and hero power or passive text.
- On touch devices, first tap acts like hover-preview, second tap confirms the action if the object is still legal.
- Tooltip anchoring should prefer staying inside the canvas and flip sides near screen edges.

## Click, Drag, And Play

- Playable hand cards pulse softly at the start of the player's turn.
- Clicking a playable hand card selects it and paints legal summon slots.
- Dragging a hand card upward enters play mode immediately after a short threshold, with the card following the pointer and snapping legal drop slots brighter than the rest of the board.
- Releasing over a legal slot plays the card.
- Releasing anywhere illegal returns the card to hand with a fast ease-out and no rules penalty.

## Attack Targeting

- Units that can attack get a ready ring and subtle idle glow.
- Clicking a ready unit selects it and paints a target line from attacker to pointer.
- Legal enemy targets gain a bright rim and ground marker.
- Dragging from attacker to target is the primary attack affordance. Click attacker then click target should also work for accessibility.
- If a taunt-style mechanic exists later, non-legal targets should remain visible but muted so the rule teaches itself visually.
- Release on a legal target commits the attack. Release elsewhere cancels cleanly.

## End Turn And Turn Teaching

- The end-turn button lives in the lower right HUD lane and is always visible.
- During the player's turn, it glows only when at least one legal action exists; if no action exists it changes to a stronger pulse so players learn they may pass.
- On the first turn, a tutorial prompt points to the best first action and falls back to the end-turn button after a short idle delay.

## Highlights And Tutorial Prompts

- Use one highlight language consistently: cyan for your legal actions, amber for enemy threat, red for imminent damage, white for neutral hover.
- The first encounter should script only the first one or two decisions. After that, prompts become reactive hints instead of step-by-step instructions.
- Tutorial prompts should be short, imperative, and attached to a visible object: "Play a unit", "Pick a target", "End your turn".
- Prompts should dismiss instantly on matching input and reappear only if the player becomes idle again.

## Reusable Input Scaffolding

- The input controller should emit a small event vocabulary: `hoverstart`, `hoverend`, `pointerdown`, `pointerup`, `click`, `dragstart`, `dragmove`, `dragend`.
- Hit-testing must prefer the highest z-index region so cards, overlays, and prompts can stack safely.
- Regions should be declarative objects with `id`, bounds, `zIndex`, and optional `contains(point)` for non-rectangular targets.
- Render code should own region generation each frame so input stays in sync with animations.
