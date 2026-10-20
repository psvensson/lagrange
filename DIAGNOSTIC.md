---
audience: development
documentClass: evidence
---

# Registration cleanup phase semantic negative

DO NOT MERGE. This branch deliberately restores one defective interaction.
It is a source-only diagnostic for `seed-release-failure-custody`, based on
exact positive candidate `e29e46abf6c5daf506d8c0500b5a9a1d16c2bcd6`.

Only registration acquisition and participant release move back outside the
existing registration `executePhase` callback. The literal constants and all
cleanup observation, exact-object custody, SQL reference discharge and
shutdown retry fixes stay intact. All test bytes are unchanged.

Frozen source SHA256:

- `src/bootstrap/bootstrap-service-seed-workflow.js`:
  `d7a6cea593672d838f5db82cbefd589b628354cf57f8d6ba3f399b2c3d739405`
- `src/bootstrap/pipeline/seed-startup-plan.js`:
  `3f7009251e1f81a97d5a8e6d80cc3568b61d160369be3665366e1a61cccfa19c`

The focused phase witness must fail after real scheduler entry because
acquisition/release no longer occur inside that boundary. The native witness
must first engage the actual ENABLE commit, original release-deadline refusal
and exact native close fault, then fail its registration-phase assertion.
Native shutdown retry and retained-store authoritative refusal remain positive
controls. Setup failure, pre-engagement timeout or absence of reproduction is
not a qualifying semantic negative.

Independent reviewer `subagent:/root/control_source_review` approved these
exact source hashes for this isolated measurement. Results and review belong
to the execution branch's Quest evidence. This branch has no acceptance,
landing, publication or deployment purpose.

## Ordinary hook and WIP preservation

The ordinary commit hook exited 1 at the inherited workflow
`local_retry_loop` decision-boundary finding. Lint, scoped complexity and
literal checks passed. The hook regenerated the owner inventory and
`test/shards/impact-graph-seal.json`; those derived metadata changes are kept.
Executable witnesses, helpers and test contracts remain byte-identical to
the positive candidate.

The failed hook output is preserved in the execution branch under
`solve/quests/seed-release-failure-custody/evidence/static-review/phase-negative-precommit.txt`.
This diagnostic uses the explicit WIP-only preservation exception in
`docs/development/solver-runbook.md:167` to provide an exact commit for the
locked negative measurement. It remains deliberately defective and has no
passing-gate or landing claim.
