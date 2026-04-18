## W2 Round 3 Invalid Hash Normalization

Author: Sage (worker, node w2)

### Context

- The app resolves unknown hashes to the home route in memory.
- The browser URL currently stays on the unsupported hash, which leaves a mismatch between the rendered page and the visible address.

### Problem

- Deep-linking to an unknown hash like `#/unknown` renders the home view but preserves the invalid URL.
- That makes refresh, copy-link, and bug reports less reliable because the address bar does not reflect the rendered state.

### Proposal

- Normalize unsupported hashes to `#/` during app startup and on later hash changes.
- Keep the change minimal: no new routes, just URL correction for already unsupported values.

### Data

- Supported hashes today: `#/`, `#/play`, `#/rules`, `#/cards`
- Unsupported hashes already fall back to the home content via `resolveRoute()` in `src/app.tsx`

### Expected Outcome

- The rendered page and browser URL stay aligned.
- Shared links from invalid states converge to the supported home route instead of preserving dead hashes.
