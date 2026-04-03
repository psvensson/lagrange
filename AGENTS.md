# AGENTS

Steering documents live under `.kiro/steering/`:
- `.kiro/steering/system guidelines.md`
- `.kiro/steering/code-style.md`
- `.kiro/steering/testing-guidelines.md`
- `.kiro/steering/doctrine.md`
- `.kiro/steering/roadmap.md`

Roadmap and edition ownership documents at repo root:
- `roadmap.md` - canonical AGPL implementation roadmap; the only roadmap that may drive specs, tasks, or code in this repository
- `product-roadmap.md` - cross-edition visibility board; status-only, never an implementation source in this repository
- `edition-matrix.md` - canonical mapping from feature area to edition and implementation home
- `platform-doctrine.md` - root platform framing only; not the implementation doctrine for coding work

Implementation scope rules:
- Only items in `roadmap.md`, or rows mapped to `AGPL repo` in `edition-matrix.md`, may drive implementation work in this repository.
- Do not implement Pro or Enterprise features in this repository.
- If a feature appears only in `product-roadmap.md`, or is mapped to an external/commercial implementation home in `edition-matrix.md`, treat it as out of scope here unless the user explicitly asks for AGPL-scoped preparatory work only.
