## Core Duel Rules

This duel is a narrow single-player lane battle designed for one fast browser encounter. The goal is readable turns, satisfying board combat, and enough depth to feel like a real card game without stack timing or edge-case rules.

## Match Structure

- One human player vs one scripted AI captain.
- Both sides start at 20 health.
- Both decks contain 20 cards.
- A match ends immediately when a captain reaches 0 health.
- If a player must draw from an empty deck, that player takes 2 fatigue damage instead of drawing.

## Turn Flow

Each turn uses the same fixed order:

1. Start of turn: refill mana to the turn cap and draw 1 card.
2. Main phase: play units, spells, and relics in any order while you have mana.
3. Combat phase: each ready unit may attack once.
4. End turn: unused mana is lost and temporary turn effects expire.

There is no instant-speed response, no stack, and no manual phase skipping besides ending the turn.

## Mana System

- Mana starts at 1 on turn 1.
- Maximum mana increases by 1 each time your turn starts, up to 8.
- Current mana refills to the maximum at the start of your turn.
- Card costs are paid once when played.

This gives the game a clear curve and keeps early turns short.

## Card Types

The initial ruleset uses only three card types.

### Units

- Units enter one of three board slots.
- Units have attack and health.
- Units cannot attack the same turn they are played unless a card effect says otherwise.
- Units stay in play until destroyed.

### Spells

- Spells resolve immediately, then go to the discard pile.
- Spells never wait for responses.
- Spells may deal damage, heal, draw, or buff a unit for the current turn.

### Relics

- Relics are persistent support cards with a simple passive effect.
- Each side may control only one relic.
- Playing a new relic replaces the old one.

Relics create some texture without requiring extra targeting complexity.

## Board Layout And Limits

- Each side has exactly three unit slots.
- If all three slots are full, that side cannot play another unit.
- Units occupy visible lanes so attacks are easy to read.
- Each player also has a captain who can be attacked directly when allowed.

Three slots is enough for positioning decisions while staying visually clean on canvas.

## Attack Rules

- A ready unit may attack once during its controller's combat phase.
- If the opposing unit in the same lane exists, it must be attacked first.
- If that opposing lane is empty, the attacker may hit the enemy captain.
- Combat damage is simultaneous between units.
- Damage to captains is immediate and not retaliated.
- A unit with 0 or less health is destroyed after combat resolves.

This creates a simple lane rule: clear the blocker, then pressure the captain.

## Keywords

Keep the launch keyword list tiny:

- Guard: this unit must be attacked from its lane before that lane can hit the captain.
- Charge: this unit may attack on the turn it is played.
- Burst: spell or unit deal effect damage immediately when played.
- Mend: restores health to a unit or captain.
- Draw: take 1 card from your deck.

These are all explainable in a hover tooltip.

## AI Turn Constraints

The first encounter AI is intentionally legible, not clever.

- The AI follows the same mana, draw, and board-slot rules as the player.
- The AI may play at most 2 cards per turn in the tutorial encounter.
- The AI prefers this priority order: playable Guard unit, strongest affordable unit, useful spell, relic if board is stable.
- In combat, the AI attacks left to right.
- The AI only attacks the captain when the lane is open.
- The AI should avoid long combo chains or hidden randomness.

These constraints make the enemy readable and keep animation time under control.

## Scripted First Encounter

The first fight teaches by scripting the opening turns instead of showing a rules page.

### Opening Setup

- The player's opening hand is fixed: a 1-cost unit, a 2-cost Guard unit, and a simple damage spell.
- The AI opens slowly with one small unit in a single lane.
- The board highlights the player's playable card on turn 1.

### Teaching Beats

1. Turn 1 teaches playing a unit: pulse the affordable 1-cost card and show a short caption like "Play a unit into an open lane."
2. Turn 2 teaches lane blocking: the enemy attacks in one lane, then the player's Guard card glows with a caption like "Guard protects this lane."
3. Turn 3 teaches spells: present a damaged enemy unit that can be finished by the starter spell.
4. After the first captain hit, remove most helper text and rely on normal highlights and hover tooltips.

### Ongoing Tutorial UI

- Playable cards glow softly in hand.
- Valid drop slots light up while dragging a unit.
- Attackable targets gain a ring when a ready unit is selected.
- Hovering or tapping a card shows a concise tooltip with cost, stats, and keyword reminder text.
- The End Turn button glows only when the player has at least one legal action or all actions are exhausted.

This teaches the game inside the board state itself.

## Implementation Notes

- Build state around deterministic turns and immediate resolution.
- Keep card text templated and short so it fits on canvas.
- Prefer encounter scripting through a small sequence of forced draws and AI choices rather than one-off rule exceptions.
- If a rule is hard to animate or hard to explain in one sentence, cut it from week-one scope.
