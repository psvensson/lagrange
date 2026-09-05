---
epicContractVersion: 2
id: semantic-authority-hardening
roadmapRow: null
graduatesTo: null
---

# Semantic authority hardening

Spans Phase 0.25 roadmap rows `RM-0.25-sc-authority-inventory`,
`RM-0.25-sc-kernel-boundary`, `RM-0.25-sc-interpretation-guards`, and
`RM-0.25-sc-boundary-certification`. `roadmapRow` is null because no single row
owns the ladder; implementation Quests link the rung they advance.

Architecture: [`architecture/protected-semantic-core.md`](../../architecture/protected-semantic-core.md).

## Intent

Phase 0.2 repeatedly exposed defects where local code interpreted a shared fact
instead of consuming its semantic owner: durable absence coerced into a concrete
epoch, replica identities used as policy, duplicate readiness/liveness
interpretations, and stateful owner duplication. Those are not isolated bugs;
they identify semantic fault lines whose meaning has system-wide blast radius.

The goal is to make those fault lines explicit and narrow before Phase 0.3 adds
new planner and index semantics. The epic does not freeze implementation or move
large stateful services into a library.

## Ladder

1. **Authority inventory.** Rank roughly the highest-risk 10–20 semantic facts.
   Record fact vocabulary, owner, interaction owner, durable/wire form,
   canonical decoder/constructor, legitimate interpretation sites, consumers,
   clock/generation owner, duplicate interpretation sites, blast radius, and
   migration difficulty.
2. **Kernel pilot.** Extract a small representative set of pure meaning into a
   deterministic in-repository semantic boundary. Include at least one durable
   decoder, one pure projection/transition, and one interaction whose stateful
   owner remains outside the kernel. No I/O, timers, ambient clocks, retries, or
   lifecycle move into the pure kernel.
3. **Negative-space guards.** Once a fact has a canonical surface, make alternate
   behavior-changing interpretation illegal outside the allowlist. Transporting
   a raw field remains allowed; assigning it independent semantic meaning does
   not.
4. **Boundary certification.** Measure legitimate kernel churn, atomic
   cross-boundary change frequency, public-surface stability, and bypasses
   caught. Use that evidence to decide whether stronger physical/credential
   isolation would reduce risk or instead create version skew and shadow
   semantics.

## Required principles

- One semantic concern has one authoritative owner.
- Every interaction between semantic owners has one owner.
- Extraction is behavior-preserving unless a Quest explicitly declares a
  semantic change.
- Consumers do not use raw persistence/cache values as alternate authority.
- Time-dependent pure functions receive owned time/projections; they do not call
  `Date.now()` as semantic authority.
- Stateful lifecycle stays with stateful owners.
- A library/package boundary is useful only when it enforces dependencies; file
  movement alone is not success.

## Extraction proof shape

Every pilot extraction should carry:

- a complete reader/producer inventory for the selected fact;
- differential parity against the pre-extraction implementation;
- red-on-revert or mutation controls for the bypass being retired;
- a negative guard forbidding the old interpretation path;
- safety and liveness receipts where the semantic fact has both;
- bounded-work/engagement receipts where the change is also an optimization;
- independent review of the exact content; and
- no opportunistic semantic cleanup hidden inside a package move.

If the pre-extraction meaning is itself wrong, repair it as a separately
identified semantic change with its own owner and receipts.

## Candidate pilot facts

The inventory decides final scope. High-value candidates from 0.2 evidence are:

- durable membership epoch: unbound versus bound value and stale fencing;
- desired replication factor versus current replica identity/holder state;
- node liveness/readiness projection and time ownership;
- terminal replica-operation outcome and retirement semantics;
- planning/readiness generation identity; and
- formation/traffic-readiness admission semantics.

Do not select all of them merely because they are listed here. Prefer a small
cross-section that proves the architecture and guards.

## Adversarial failure modes

A Quest must stop rather than "complete" the ladder if it creates any of these:

- a god kernel that owns orchestration as well as meaning;
- two versions of a semantic fact, one in the kernel and one retained as a
  compatibility fallback;
- a consumer-specific cache or decoder because the kernel API is inconvenient;
- generated or bundled kernel source that becomes harder to inspect than the
  original code;
- wrapper/type proliferation without eliminating category errors;
- broad protected-file lists based on complexity rather than semantic blast
  radius; or
- a separate-repository dependency before cross-boundary atomicity has been
  measured.

## Exit evidence

The epic is complete when:

- the protected semantic inventory exists and is ranked;
- the pilot facts have one canonical semantic implementation;
- alternate interpretation paths for those facts are mechanically rejected;
- extraction parity and mutation controls are green;
- ordinary consumer changes can proceed without protected edits; and
- boundary-stability evidence supports an explicit decision on stronger
  physical isolation.

## Deferred home

A separate repository/package with normal-agent read-only credentials is not a
Phase 0.25 requirement. It is a later hardening option if the boundary proves
stable. Literal resistance to a sufficiently privileged credential requires an
external repository/ruleset/credential boundary; an in-repository guard must
not be described as such a security boundary.