# Duel TCG Static Site

Single-player duel card game site built with TypeScript, Vite, and Preact.

## Scope

This project targets a browser-only static deployment. The site is intended to ship four user-facing surfaces:

- Home page
- Play page
- Rules page
- Card gallery page

The game implementation uses plain TypeScript modules for deterministic state updates and browser-local persistence with a run-scoped storage namespace.

## Development

```sh
npm install
npm test
npm run build
```

## Current Status

The scaffold and early gameplay foundations are in place:

- Static-safe Vite + Preact shell
- Hash-routed top-level pages
- Deterministic preconstructed deck state module
- Run-scoped local persistence helpers

The remaining work is focused on the playable duel UI, AI encounter flow, rules content, and card reference content.

## Deployment Notes

- Build output goes to `dist/`
- The app uses relative asset paths for repository-subpath hosting
- Persistence keys must be prefixed through `src/lib/storage.ts`
