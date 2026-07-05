# Attempt diff compressed (2026-07-05)

`legacy-work-tracker-removal.diff` (47M) is the recorded attempt `changeRef`
(`diff:solve/changes/legacy-work-tracker-removal/legacy-work-tracker-removal.diff`)
of the quest `legacy-work-tracker-removal` (closed SOLVED 2026-06-01). It was
gzipped in place to slim the working tree:

- Restore with `gunzip -k legacy-work-tracker-removal.diff.gz` (e.g. before
  re-running `solve.js audit` on this closed quest).
- The original is also recoverable via
  `git checkout 58bec29d -- solve/changes/legacy-work-tracker-removal/`.

`validation.json` (the quest's sealed oracle-probe target) is untouched — the
Solver re-reads it to evaluate closure; do not remove or compress it.
