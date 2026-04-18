# Leader Brief: Duel TCG Static Site

You are building a polished static website that contains a finished single-player duel trading card game. The final site must feel complete enough to publish publicly, not like an internal prototype. The required surface area is a home page, a play page with the actual game, a How to Play or Rules page, and a card gallery or reference page. The game itself should support player-versus-AI encounters with preconstructed decks, visible player and enemy health, deck and hand and discard and battlefield zones, a simple resource system, creature and spell cards, deterministic turn flow, and a small ladder or sequence of encounters that a player can complete from the browser.

Use the prescribed stack exactly: TypeScript, Vite for bundling, Preact for the UI, plain TypeScript modules for game state, and npm as the package manager. Build output must go to `dist/`. There is no backend and no network dependency. Everything must run entirely in the browser.

Treat deployment constraints as part of the product requirements. The finished artifact is served from a repository subpath, not from the domain root, so asset references and navigation must work from a nested path. Use relative asset paths and avoid absolute `/...` references. The site must build with a single `npm run build`, and the generated `dist/` directory must be ready for the harness to copy into a published run directory without manual edits.

Persistence is required. The game must save enough local state for a player to reload and resume an in-progress encounter. Browser-local storage is allowed, including `localStorage` or IndexedDB. The harness will inject a run-scoped storage namespace string; every persisted key must be prefixed with that namespace so different benchmark runs do not collide in the same browser profile.

The acceptance bar is user-facing, not test-facing. A player must be able to open the site without runtime errors, navigate from the home page to play, rules, and card gallery through visible UI affordances, start an encounter, take a legal turn, see the AI respond, finish an encounter in a visible win or loss state, reload during progress, and resume from the saved state. The rules page must explain the game clearly enough that a reader can understand how turns, resources, card types, and victory work.

The evaluator will interact with the built site like a real player. It will read what is visible on screen, click visible controls, type into obvious inputs, and use the rules page to understand what to do next. It will try to load the site cleanly, navigate across the required pages, start a game, complete a turn, finish an encounter, reload and resume, and judge whether the rules page is actually informative. This benchmark does not ship any hidden test code, required DOM hook list, or mandated selector contract. Build for clarity and playability in the browser UI itself rather than relying on hidden test APIs or implementation-only knowledge.

Keep the rules narrow. Use preconstructed decks only, with no deckbuilder, no multiplayer, and no backend services. Do not add instant-speed interaction, priority passing, or stack-resolution complexity. This benchmark is intentionally not asking for a Magic-scale rules engine.

Stay within the recommended content bounds unless there is a strong reason not to: use 20-card decks, keep the card pool to roughly 12 to 24 unique cards, limit the game to at most 2 factions or themes, and keep keyword mechanics to about 4 to 6 total. Favor a small set of understandable mechanics that can be taught clearly on the rules page over a larger, harder-to-finish system.

## This must be a graphical game, not a text game

Real TCGs are visual. A page of words describing "the Ember Pyromancer deals 3 damage" is not a card - it is a line item. This benchmark judges your artifact as a game a stranger would want to play, which means it must look like one.

Concrete requirements:

- **Every card is a visual object, not a table row.** A card has an art panel (SVG, CSS-drawn illustration, or canvas scene), a named frame, a cost pip, a power/toughness or damage/health badge, a type line, and its rules text - arranged as a card, not stacked text. Use inline SVG or CSS/Preact components to produce distinct illustrations per card; do not inline generic placeholders for every card. Art may be simple geometric/emoji-scale compositions, but each card must look different from the others in a way a player can recognize at a glance.
- **The board is drawn.** The play surface has a rendered layout - zones visibly separated with borders, shading, or backgrounds; the hand fanned or docked; the battlefield with slots; a discard pile and deck back shown as stacks; health/mana shown with numeric readouts and iconography (hearts, crystals, pips, gauges). Players should be able to understand whose turn it is and what is happening without reading any sentence-level prose on the play page.
- **Factions and themes are shown, not just named.** Each faction has a consistent visual identity: a color palette, an emblem or sigil, card-frame treatment, and typography that make cards from that faction recognizable across the gallery and on the battlefield.
- **Actions produce visible feedback.** Playing a card animates or transitions it into the battlefield. Attacking produces a brief visual beat (flash, shake, damage number, fade). Turn changes update active-turn indicators visibly. Winning or losing an encounter shows a clear end state, not just a line of text.
- **The gallery is a gallery.** The card-reference page shows cards as cards in a grid or shelf layout, with the same art and frame used in play. Hovering or tapping a card reveals its full rules text.
- **The home page sets the tone.** A title treatment, a hero visual, clear calls to action, and faction or encounter previews - not a bulleted list of features.

Text-only TCGs with `<ul>` "cards" and plain readouts will be scored low regardless of whether the mechanics work. A crude but visibly illustrated site beats a polished wall of text.

## Quality dimensions we value

The judge will score the finished artifact on these dimensions. Design with them explicitly in mind.

1. **Visual craft and aesthetics.** Does it look like a game? Card art, frames, iconography, typography, color discipline, layout rhythm, animation polish. A single consistent look that carries through home, play, rules, and gallery beats a page of one-offs.
2. **Gameplay depth and fun.** Does each turn present a real decision? Are there card interactions that feel surprising or satisfying (synergies, counters, tempo swings)? Are there moments where a player can feel they made a good call? Mechanically complete but flat ("tap to attack, repeat") scores low here.
3. **Replayability.** Does an encounter feel meaningfully different from the last one, through varied deck matchups, encounter mechanics, card draws, or enemy behavior? Could a player reasonably play three runs in a row without it feeling identical? A single one-shot encounter scores low here even if polished.
4. **Rules clarity and learnability.** Can a first-time player read the rules page and then actually play a turn? Is the in-game UI legible enough to teach by example? Does every piece of state on the play page make sense at a glance?
5. **Cohesion and theme.** Art, copy, faction names, card names, encounter names, and mechanics all reinforce the same world. Nothing feels like it was generated by a different team than everything else.
6. **Completeness and polish.** Build is clean, no runtime errors, persistence actually works, navigation is frictionless, no broken states, no half-finished surfaces. This is table stakes, but still graded.

Optimize for all six. A site strong on mechanics and weak on visuals, or vice versa, will be scored below a site that is merely adequate on both. The judge and the public-comparison site will show these dimensions side by side.
