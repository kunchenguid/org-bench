## Context

- The app now exposes multiple top-level routes, including the card gallery.
- Browser tab state should track the active route so navigation is legible outside the page body.

## Data

- Current local diff against `run/google-seed-01/main` is limited to `src/app.tsx` and `src/app.test.tsx`.
- The behavior change is one small route concern: keep `document.title` aligned with the active page.

## Proposal

- Set `document.title` from the resolved route title.
- Keep the home route title as `Duel of Embers`.
- Prefix non-home routes as `<Route> - Duel of Embers`.

## Expected Outcome

- Navigation updates both visible route content and browser-tab context without introducing new routing abstractions.
