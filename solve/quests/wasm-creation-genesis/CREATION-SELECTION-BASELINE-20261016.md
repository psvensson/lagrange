# Creation-selection stage: reviewed fixture and missing-capability baseline

This follows the operator-authorized author ACCEPT of the bounded process-custody
repair at 1603b31a90e1c1d814898ddfa4de4851aae9865e. It does not close the larger
creation/genesis Quest or any global static, main merge, or release gate.

## Exact stage identities

Accepted custody source: 1603b31a90e1c1d814898ddfa4de4851aae9865e, draft PR127.
Initial creation branch: 2218eeb58f99f2ecd527094662938ce4f76ad491.
Measured corrected fixture: 6e7eb3d34acf5dee89e21e69c0e505e59bbbfa7c.
Branch: work/rs-raft-creation-selection-20261016.

The latter commit changes only the fixture and the canonical generated import
seal and subsystem classifications. Production src and all nine CAS oracle
assertions are unchanged. No fixture-only schema, alternate identity function,
local chooser or speculative creation method was introduced.

## First attempt: unengaged fixture failure, retained

Request b6cf3cf3c23e45cfbde6e893cf1d0518 on adam-laptop completed at
2026-10-16T11:54:45Z, exit 1, zero assertions, 462ms whole file.
The fixture imported deriveServiceDefinitionId, which is not exported by
service-lifecycle-command-owner.js. This is an apparatus error, not evidence
of a product safety defect or of SQL CAS execution.

Request SHA256: 0c56e5bc59faf6dcd0ca1083466d4198abb386b729b1a7b0b04848f4231dc014.
Executor log: 2126 bytes; SHA256
f51b154b1941d6d6bb959443f791022f828a023f0b9dd19a394c17d7273b1a2b.
The first result remains unchanged in the private lab request and this record.

## Fixture correction and review

Use the existing ServiceLifecycleCommandOwner INSTALL operation to produce the
canonical service_definition_id and revision_id. The component resolver response
is explicitly supplied fixture evidence; no payload store, actual OCI pull,
service activation or consensus startup is claimed. The catalog setup belongs
to the normal installation owner, not copied fixture hashing or a new export.

Scoped ESLint and strict cyclomatic checks pass. Canonical test metadata refresh
and import-graph-only generation completed with exit 0. The published patch
matches three exact locally generated postimages:

- Fixture: 6feaa80dbfaf23374a27db5cd8c9b6b763ccc78f.
- Import graph seal: 55a9a0665206e6d03b23813a65a7b21b588ad342.
- Subsystem classes: 39cdec033de6080134a5af4af1a71fc3146ee50b.

Patch SHA256: d452a3f5a68f91bbf621262373b2b588a039a5a63745ff022482c796b0c6a2d4.
Publication checked real parent ancestry and exact postimages before normal
non-force push. It did not execute behavioral tests or certify source.

Author review: ACCEPT the narrow fixture wiring correction for continued
capability measurement. This is not approval of an implemented CAS protocol.
The corrected installation setup is still behind the missing-schema check,
so it has not itself been exercised successfully by this baseline.

## Corrected baseline: actual missing production capability

Request c53c10873f1744d6b3e9f7e53e24f0f0 on adam-laptop completed at
2026-10-16T12:07:37Z, exit 1. Normal dependencies, existing classified placement,
retry=0, calibrated factor 2.0; no timeout, thermal or test-budget changes.
The thermal guard held at CPU 80C and later observed 41C before execution.

- Existing service-lifecycle-command-owner.test.js: PASS, 6 reported assertions,
  603ms whole file.
- service-instance-creation-cas.test.js: 0 pass / 9 failed cases, 633ms whole file.
  The fixture's production-schema prerequisite is absent:
  service_instances must have production schema registration before execution.

The first schema check precedes SQL setup in every case. These failures are a
missing-capability baseline, not nine independent discovered protocol defects.
Selection, losing-request replay, resource CAS, serving grants and retirement
have not yet been executed. The six existing command-owner assertions are a
separate positive control, not a substitute for that missing interaction.

Request SHA256: 391ed0594ef4eb7b5d4c3cd093b61a497fc86815891a9c2e57335f8ef11afbbe.
Executor log: 16684 bytes; SHA256
eafc7960865e72d13d39859f6615fc8d7c94b4fdcede222953fb15fbb045e047.
The returned tail and a separate first-4000-byte evidence response were read.
The raw full log and per-case artifacts remain local; no full archive export or
cloud hash verification of that complete log is claimed.
Evidence request 077b0f25587843eda1c89e28dea35d64 completed at 12:09:12Z.
First chunk raw SHA256: 4b873c67b0ee7bd98d50cc2844e6e58ba152fdf35bcf6c1538c1251fa462a29d.
Redacted returned text need not have the raw chunk's digest.

## Next implementation boundary

Production creation-selection remains unimplemented. Follow approved CONTRACT-R2
through the existing schema, ServiceDefinitionsOwner, gateway and CDC owners.
The single durable row CAS, not runSerialized or a fixture map, must arbitrate
selection and fixed resource slots. Original request identity survives unknown
answers; historical success is separate from present serving permission.
The predecessor's outstanding resources must prevent successor serving.

Adding the real schema must follow its bootstrap/cache/owner registrations;
do not merely satisfy the fixture with a local CREATE TABLE. Only after those
real dependencies and the owner methods exist can the remaining oracle and
native-composition obligations be measured. An accepted component CAS increment
will not by itself prove physical resource closure or RF3/restart correctness.

All source-execution and evidence requests in this checkpoint have terminal
results. No job was replayed to turn a failure green. Main, shared local staged
work, the accepted custody branch and other implementation lanes are unchanged
by this creation-fixture stage. Global owner-debt/static closure remains held.
