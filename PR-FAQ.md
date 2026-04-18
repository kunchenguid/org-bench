## Press Release

Today we are introducing Duel of Embers, a fast single-player browser card game where players climb a short duel ladder against themed AI rivals without downloads, accounts, or waiting. The site ships as a polished static experience with a home page, playable duel board, rules guide, and card gallery, so anyone can open the link and immediately understand the world, the cards, and how to win.

The first release focuses on clarity and momentum. Players start with a prebuilt deck, spend simple crystal resources, summon creatures, cast spells, and try to break through each encounter in sequence. The site remembers an in-progress duel locally, so a player can reload and continue the same fight.

This round-1 scaffold establishes the shared app shell, page structure, build configuration, and narrative direction so the rest of the team can parallelize gameplay systems, encounter content, and visual craft without reworking the foundation.

## Headline

Duel of Embers brings a complete browser card duel to a simple static site.

## Sub-headline

The scaffold is live, the pages are wired, and the team can now build the full duel ladder on one shared foundation.

## Problem

Players evaluating a browser game decide in seconds whether it feels coherent, learnable, and worth clicking deeper. An empty or fragmented starting point creates friction for both players and contributors. We need a visible shell immediately so the experience can grow into a publishable game instead of a pile of disconnected mechanics.

## Solution

We are shipping the initial shared skeleton for a static TCG website: Vite + Preact app wiring, relative-path deployment config, visible navigation across Home, Play, Rules, and Cards, and starter documentation that frames the finished product from the player backward.

## Customer Benefit

This makes round-2 work faster because every contributor builds against the same routes, build system, and page expectations. It keeps the solution frugal by using a small static stack with no backend and no deployment-specific rewrites.

## FAQ

### Who is the customer?

The customer is a curious player who opens the published site expecting a complete, understandable duel game in the browser.

### What is the core use case?

Open the site, understand the fantasy and navigation immediately, click into Play, learn the rules quickly, inspect cards visually, and progress through AI encounters without setup friction.

### What is in scope for v1?

In scope for v1 is a polished static website with a duel ladder, prebuilt decks, AI turns, persistence, a readable rules page, and a visual card gallery.

### What is explicitly out of scope?

Out of scope are multiplayer, deckbuilding, backend services, account systems, and deep stack-based TCG rules complexity.

### How will we know this works?

It works when a player can load the site without errors, navigate every page through visible controls, start a duel, take a legal turn, see the AI respond, finish the encounter in a visible end state, reload, and resume from saved progress.

### What are the biggest risks?

The biggest risks are shipping mechanics that are functional but visually flat, or visuals that look promising but do not support a complete deterministic duel loop. Another risk is drift between parallel contributors without a shared shell.

### Why is this the simplest thing that works?

The scaffold is deliberately small: one app shell, one route model, one relative-base deployment config, and one focused verification test. It unblocks parallel work without overbuilding systems we may still revise.
