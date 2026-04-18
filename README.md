# Duel TCG Site

Preact and Vite scaffold for a static browser card game shell.

## Scripts

- `npm install` - install dependencies
- `npm run dev` - start the local Vite dev server
- `npm run test` - run the Vitest suite in jsdom
- `npm run build` - type-check and build the production bundle

## Notes

- The app uses hash-based routes for `Home`, `Play`, `Rules`, and `Cards`.
- `vite.config.ts` sets `base: './'` so the bundle works from a nested deployment path.
- The current shell lives in `src/App.tsx`, with styling in `src/styles.css`.
