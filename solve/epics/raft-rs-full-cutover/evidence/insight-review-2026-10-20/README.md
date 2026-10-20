# Lagrange architecture verification packet — 2026-10-20

Read `REVIEW.md` for source-bound conclusions, proposal dispositions, counterexamples, proof limits and primary references.

Run the self-contained counterexample checks with Python 3.10 or newer:

```sh
python3 check_models.py --output model-results-reproduced.json
```

No third-party packages, network access, credentials, cluster, or Lagrange installation are required. Each model is deliberately an authored abstraction, not an extracted model of the production code. The checks fail if a defective rule is not discriminated, if a proposed abstract repair violates its modeled property, or if a repair has no engaged positive case.

Files:

- `REVIEW.md`: architectural assessment and bounded next verification unit.
- `check_models.py`: eight explicit finite state-machine comparisons.
- `model-results.json`: executed state counts, assumptions and shortest counterexample traces.
- `source-manifest.json`: inspected exact U1 source paths and Git blob bindings.
- `SHA256SUMS`: integrity hashes of the packet contents.

No production files were changed, no release or U1 acceptance was granted, and no independent verifier approval is claimed.
