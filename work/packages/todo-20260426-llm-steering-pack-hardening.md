# LLM Steering Pack Hardening

## Why

The generated compact steering pack is useful, but truncated rule entries can
remove the actual required action from a rule. LLM agents need compact rules
that are complete enough to act on without reopening the full steering file.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reject incomplete generated rule text.
2. Preserve required child bullets for normative parent sentences.
3. Add focused tests for steering pack generation quality.

## Out Of Scope

1. Rewriting all steering content.
2. Adding network-backed LLM review as a required local gate.

## Residual Closure Inventory

- [ ] `npm run steering:llm:pack` regenerates complete compact rules.
- [ ] Focused tests cover incomplete-rule rejection.
- [ ] Generated packs remain small enough for agent context.
