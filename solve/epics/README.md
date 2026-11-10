---
audience: development
---

# Epics and executable Quests

An epic coordinates an approved multi-Quest objective. It records current status,
dependencies, scope, evidence limits and the next responsible owner. A Quest is
the bounded executable unit; a detailed spec holds the implementation contract.
Single-sitting work with an obvious proof can use the direct path in
[solver-quests.md](../../docs/steering/workflow-guidelines/solver-quests.md).

Current shapes are owned by [schema.js](../../scripts/solve/schema.js), and
interpretation by [store.js](../../scripts/solve/store.js). An epic has front matter
with `id`, `status` (`open`, `done`, `superseded`), `proof`, `quests` and
`authorizes`. An open nonhistorical epic also has `doneWhen: {probe, args}`.
Do not infer acceptance from its prose or from the status of linked work alone.
Every measured claim retains its own proof and applicability.

Use `node scripts/solve.js board` to inspect current records. Create each Quest's
`quest.json` and append-only `log.ndjson` according to the routed workflow; seal
through `start` only against a genuinely measuring negative. `probe` measures
without executing live work. `land` checks the sealed predicate, scope, review and
canonical gates before committing. Publication is a separate exact-HEAD step.
See [the runbook](../../docs/development/solver-runbook.md) for actual commands.

Keep the epic's current summary actionable. Separate implementation, independent
verification, bounded repair, representative service proof and full acceptance.
Retain dated decisions and failed evidence; reconcile older guidance with current
owners instead of reintroducing retired commands or parallel task state.
