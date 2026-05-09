# Architecture Steering Pack

Load for owner, boundary, and shared-contract work.

## Rules

1. Every durable concern has one semantic owner.
2. Callers consume owner contracts; they do not reconstruct owner decisions.
3. A shared boundary declares owner, contract shape, evidence inputs, allowed
   consumers, forbidden reinterpretations, diagnostics, and proof surfaces.
4. If a concern has operational, diagnostic, and owner-internal views, name the
   role of each view.
5. Do not add a second cache, snapshot, helper, or output shape for the same
   concern without a non-overlapping role boundary.
6. Normalize boundary input once; do not leak storage, wire, or transport shape
   into runtime model names.
7. Branch piles around lifecycle, readiness, permission, admission,
   retryability, phase, quota, or ownership indicate a missing state model.
8. Prefer decision snapshots, owner queues, canonical gateways, and explicit
   observation contracts over caller-local interpretation.
9. Resource lifetime must have one owner, one bound, one teardown or expiry
   rule, and one diagnostic surface.
10. If repeated bugs appear at one boundary, the next package should reduce
    paths, states, or owners crossing that boundary.
