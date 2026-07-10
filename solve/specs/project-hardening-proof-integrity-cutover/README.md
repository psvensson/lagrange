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

1. `node scripts/run-project-hardening-proof-integrity-cutover-scenarios.js`
2. `npm run test:static`
3. `npm run model:contracts`
4. `npm run test:fast`

The guard scenario owns the Quest report and covers the focused assertions for
test registration, live PostgreSQL client behavior, dependency acyclicity,
quality baselines, CI/documentation agreement, network defaults, and package
entrypoint behavior. Three consecutive PASS reports satisfy the Quest.

