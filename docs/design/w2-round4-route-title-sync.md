## W2 Round 4 Route Title Sync

Author: Sage (worker, node w2)

### Context

- The app uses a single static HTML title: `Duel of Embers`.
- The scaffold already has distinct route labels and page titles for home, play, rules, and cards.

### Problem

- Browser tabs, history entries, and shared screenshots do not reflect the active route.
- Route-level context is present in the UI but missing from the document metadata.

### Proposal

- Update `document.title` whenever the active route changes.
- Keep the home title as `Duel of Embers` and prefix sub-routes with the page title.

### Data

- Supported routes today: `4`
- Existing route titles in `src/app.tsx`: `Duel of Embers`, `Play`, `How to Play`, `Card Gallery`

### Expected Outcome

- The browser tab stays aligned with the visible route.
- History and screenshots gain route-specific context without changing the page layout.
