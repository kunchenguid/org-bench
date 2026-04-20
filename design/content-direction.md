## Verdant vs. Ironbound

This spec defines a compact single-player duel theme that is easy to teach in the first encounter, supports distinct card art, and stays within the benchmark's scope.

## Core Pitch

- World: a ruined greenhouse-city where wild growth is reclaiming abandoned war foundries.
- Factions: 2 only.
- Match framing: the player pilots the Verdant Circle against the Ironbound Legion.
- Deck size: 20 cards per side.
- Unique card pool: 16 cards total.
- Replay value: both sides share a small set of clear synergies, but draw order changes whether the game is about early swarming, growth buffs, or armored counterplay.

## Factions

### Verdant Circle

- Identity: living vines, bioluminescent spores, antlered wardens, reclaimed stone, glasshouse magic.
- Palette: jade, moss, teal, pollen gold.
- Gameplay feel: wide boards, healing, growth over time, trading small units up.
- Frame cues: curved wood, leaf inlays, glowing seed sockets.
- Sigil: a split seed with two curling vines.

### Ironbound Legion

- Identity: rust-red armor, furnace cores, riveted shields, siege tools, oath banners.
- Palette: iron gray, ember orange, crimson, brass.
- Gameplay feel: sturdy blockers, direct damage, tempo swings from breaking through damaged enemies.
- Frame cues: forged steel corners, vent slits, orange furnace glow.
- Sigil: a hammer crossing a tower shield.

## Heroes

### Player Hero: Lys, Heartroot Warden

- Look: masked ranger-mage with branch antlers, seed lantern, moss cloak.
- Health: 20.
- Power: once per turn, spend 2 mana to heal a friendly unit for 2.
- Teaching role: introduces healing and durable board combat.

### Enemy Hero: Commander Varka

- Look: veteran legion captain in furnace plate with a cracked glowing visor.
- Health: 20.
- Power: once per turn, spend 2 mana to deal 1 damage to a unit.
- Teaching role: shows chip damage matters and sets up Break effects.

## Keyword Mechanics

Keep the rules text budget low. Use only 5 evergreen keywords.

- Grow: gains the listed bonus at the end of your turn if this survived.
- Guard: enemies must attack this first.
- Break: bonus triggers when this damages an already damaged enemy.
- Bloom: extra effect when played with all mana spent.
- Last Light: effect triggers when this dies.

## Card Pool

Target format: Name - Cost - Attack/Health - Keyword(s) - One-line effect.

### Verdant Circle Cards

1. Seedling Scout - 1 - 1/2 - Grow +1/+0 - Cheap opener that teaches surviving matters.
2. Thornhide Cub - 2 - 2/3 - Guard - Early wall that protects fragile Grow units.
3. Glassvine Adept - 2 - 2/2 - Bloom - If Bloom triggers, draw a card.
4. Mossblade Ranger - 3 - 3/2 - None - On play, give another friendly unit +1 attack this turn.
5. Lantern Stag - 4 - 3/4 - Grow +0/+1 - Midgame stabilizer with clear visual antler glow.
6. Sporeshower - 3 - Spell - None - Heal all friendlies for 1 and give them +1 attack this turn.
7. Rootsnare - 2 - Spell - None - Deal 2 damage to an enemy that already took damage this turn, otherwise deal 1.
8. Elder Bloomheart - 5 - 4/5 - Last Light - On death, summon a 2/2 Sapling with Guard.

### Ironbound Legion Cards

9. Ash Recruit - 1 - 2/1 - None - Simple aggressive starter.
10. Shieldmate - 2 - 1/4 - Guard - Soaks damage and showcases faction contrast.
11. Furnace Hound - 2 - 3/1 - Break - After Break, gain +1 health.
12. Rivet Slinger - 3 - 2/2 - None - On play, deal 1 damage to any enemy.
13. Bastion Smith - 3 - 2/4 - None - On play, give another ally +1 health.
14. Ember Volley - 3 - Spell - None - Deal 2 split as 1 damage pings to up to two enemies.
15. Gatecrusher - 4 - 4/3 - Break - After Break, this may hit the enemy hero for 1.
16. Siege Captain - 5 - 4/4 - Last Light - On death, deal 2 damage to the weakest enemy.

## Preconstructed Decks

### Player Deck - Verdant Tempo Growth

- 2x Seedling Scout
- 2x Thornhide Cub
- 2x Glassvine Adept
- 3x Mossblade Ranger
- 2x Lantern Stag
- 2x Sporeshower
- 2x Rootsnare
- 2x Elder Bloomheart
- 3x factionless resource card or basic mana crystal equivalent, if the engine needs explicit ramp cards; otherwise omit and use automatic mana.

If the engine uses automatic mana, replace the 3 filler slots with 1 extra Seedling Scout, 1 extra Thornhide Cub, and 1 extra Lantern Stag to keep the list at 20.

### Enemy Deck - Ironbound Attrition

- 3x Ash Recruit
- 3x Shieldmate
- 2x Furnace Hound
- 3x Rivet Slinger
- 3x Bastion Smith
- 2x Ember Volley
- 2x Gatecrusher
- 2x Siege Captain

## First Encounter Concept

- Encounter name: The Breach at Glasshouse Gate.
- Story beat: the Legion is trying to burn open the greenhouse wall before the wild core wakes.
- Tutorial goal: teach summon, attack, Guard, hero powers, and why damaged targets matter.

## Tutorial Flow

1. Opening board: player starts with Seedling Scout and Thornhide Cub in hand; enemy starts with a visible Shieldmate already on board.
2. Prompt 1: pulse the Scout and show "Play a unit to claim the lane."
3. Prompt 2: next turn, pulse the Cub only if the enemy has a stronger attacker, teaching Guard naturally.
4. Prompt 3: when Rootsnare is in hand and a damaged target exists, show "Damaged enemies are easier to finish."
5. Prompt 4: after combat damage sticks, pulse the hero power icon and show "Lys can keep a survivor growing."
6. AI script for first game: favor obvious attacks and one Break sequence so the player sees the damaged-target pattern.

## Replay Hooks

- Alternate enemy openers between Shieldmate defense and Ash Recruit pressure.
- Randomize one of two midboss patterns: Siege Captain finisher or Bastion Smith fortification chain.
- Offer 3 possible starting hands tuned around different lessons: Grow, Guard, or Bloom.

## Asset Placeholder Specs

These are enough for another worker to produce art or procedural placeholders without guessing.

### Board

- Background: cracked conservatory floor on left half blending into iron siege scaffolds on right half.
- Centerline prop: shattered greenhouse gate with ember sparks drifting through vines.
- Lanes: 3 ground lanes implied by stone paths and rail grooves.

### Hero Portraits

- Lys portrait crop: shoulders up, antler silhouette readable at card size, green lantern glow on one side.
- Varka portrait crop: furnace visor slit, shield edge, orange backlight from forge smoke.

### Card Illustration Targets

- Every card should have one readable silhouette and one accent color from its faction.
- Verdant cards: organic S-curves, spores, petals, bark texture.
- Ironbound cards: triangles, rivets, smoke, plate edges, sparks.

### Effect Sprites

- Verdant attack: thorn lash trail and pollen burst hit flash.
- Ironbound attack: spark shower and shield-bash radial crack.
- Heal effect: rising seed motes.
- Death effect: leaf scatter for Verdant, cinder crumble for Ironbound.

### HUD/Icon Set

- Mana icon: seed crystal for player, furnace gem for enemy.
- Attack icon: crossed claw mark.
- Health icon: shield-heart medallion.
- Keyword badges: leaf sprout for Grow, wall chevron for Guard, hammer crack for Break, flower burst for Bloom, candle flame for Last Light.

## Why This Direction Fits

- The two factions are visually distinct enough for strong board readability on canvas.
- The keyword set stays small and mostly board-centric, which is easy to tutorialize in-motion.
- The decks create simple but real decisions: protect Grow units, line up Break turns, or spend mana exactly for Bloom.
- The asset list is concrete enough for implementation without locking the team into one rendering pipeline.
