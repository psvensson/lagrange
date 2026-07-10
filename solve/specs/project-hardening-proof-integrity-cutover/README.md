# Project Hardening Proof-Integrity Cutover

## Result

The repository's public claims, canonical test commands, runtime network
surfaces, architecture dependency graph, and quality ratchets agree with live
behavior and fail closed when evidence is absent.

## Scope

- Make TAP file and shard execution fail when no tests are registered or any
  repository test is skipped.
- Engage the PostgreSQL protocol handler on the managed runtime listener and
  prove a real `pg` client can connect, authenticate according to the declared
  mode, and execute a query.
- Remove every known production dependency cycle and make dependency checks
  strict rather than allowlisted.
- Bring all current static gates green, tighten measured baselines to the live
  counts, and prevent new headroom.
- Align push/nightly/release CI documentation and secure externally bound
  admin/PostgreSQL defaults with explicit trust-mode opt-in.
- Define a side-effect-free package library entry separate from the daemon
  entrypoint.

## Proof

Run `npm run test:project-hardening` (the same executor used by `test:gate` and
the Solver scenario). Its sole command inventory is the versioned manifest at
`test/manifests/project-hardening-proof-manifest.json`; the spec intentionally
does not repeat that ordered command list.

The manifest runner records per-command status and content identity, rejects
missing or stale artifacts and manifest drift, and writes the Quest report.
Three consecutive PASS reports satisfy the Quest.
