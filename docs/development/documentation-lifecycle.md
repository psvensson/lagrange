---
audience: development
documentClass: current
---

# Documentation Lifecycle

Repository documentation is a current view of the system, not an archive of how
the current implementation was reached. Historical execution evidence remains
available through Git and the Solver evidence store without appearing as current
guidance.

## Document Classes

The repository derives a document class from its location. Frontmatter may state
`documentClass` when a file is an intentional exception.

| Class | Home | Content contract |
| --- | --- | --- |
| `current` | Root guides plus maintained Markdown under `architecture/`, `charts/`, `ci/`, `docs/`, `examples/`, `src/`, and `test/` | Behavior, operations, architecture, integration, and development process implemented by the current tree |
| `planning` | Human root roadmaps, `solve/epics/`, and `solve/specs/` | Unresolved intent linked to active or draft work |
| `steering` | Canonical sources under `docs/steering/` | Current rules and stable scope/sequence maps that bind repository work |
| `generated` | Generated steering packs and indexes | Rebuilt from canonical sources; never hand-edited |
| `evidence` | Solver logs, changes, artifacts, retained reports, explicit case studies, and formal-model narratives under `models/` | Proof or execution provenance; never presented as runtime-current guidance. Mutable formal-model narratives still receive link and repository-path validation. |
| `compatibility` | Small path-pinned pointer documents | Redirect only; no copied architecture or process narrative |
| `history` | Changelog and release history | Deliberate release chronology |

The human roadmap and the agent feature map intentionally have different
classes. Root `roadmap.md` is a planning narrative for product direction.
`docs/development/agpl-feature-map.md` is a stable steering contract whose row
identities constrain implementation scope; it does not record active execution
state. Active goals and evidence remain owned by the Solver.

## Graduation Rules

When a change finishes an operation, the same Quest must:

1. update the canonical current document;
2. move unresolved work into an active epic or specification;
3. remove temporary migration, rollout, review, or completion prose;
4. update every path-pinned consumer before deleting a document; and
5. leave immutable Solver evidence unchanged unless an explicit retention
   migration classifies and verifies every affected artifact.

Do not create documentation archive directories. Git and Solver evidence preserve
history. A terminal epic or specification is not deleted merely because its linked
work reached terminal state; planning graduation is a separate retention-governed
operation.

## Enforcement

`npm run audit:documentation-current` classifies every tracked documentation
zone, checks maintained Markdown links and repository-path references, rejects
planning/history section roles in current documents, and rejects obsolete
narrative directories. Generated files and immutable Solver evidence are exempt
from reference validation; mutable formal-model evidence is not.
History keeps Markdown-link validation but may cite repository paths that
existed only at the recorded point in time.
References to declared ignored projections such as `solve/state/` are checked
against the lifecycle allowlist rather than the mutable contents of a local
working tree.

`npm run audit:doc-audience` independently checks audience zoning. Both run in
`npm run test:static`.
