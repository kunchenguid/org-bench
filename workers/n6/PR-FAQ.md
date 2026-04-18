## Customer

Integrators and sub-leads need a fast way to understand what n6 built and why it matters before they merge it.

## Problem

Round-by-round handoffs can drift into implementation detail and lose the customer impact, which makes triage slower.

## Approach

Use this lightweight template when handing off delegated work from n6:

- Customer problem:
- Why this change matters now:
- What changed:
- Risks or follow-ups:

## FAQ

### Why keep this inside `workers/n6`?

It stays isolated until n6 receives a concrete delegated area from n2.

### What should n2 be able to answer after reading a handoff?

What changed for the customer, why it was worth doing now, and what risk still needs attention during merge.

## Example Narrative

I built a small customer-facing fix in the delegated n6 area so the next reviewer can understand the change quickly and merge with confidence. The goal was to reduce handoff friction, keep the scope contained, and make the customer impact obvious before anyone reads implementation details.
