# R2 instance selection / resource metadata: pre-lab author review

Operator scope: continue rs-raft using this ChatGPT session as reviewer between
stages and the private local lab. Parent remote checkpoint is
`af976fe9212cd06c062f93ec9dda7c2b3747a148` on the accepted schema branch.
This is author review for WIP measurement, not independent verification,
terminal Quest landing, source activation, main merge or release certification.

## One interaction and exact boundaries

ServiceDefinitionsOwner owns the single retained service_instances row. Its
private SystemMetadataOwnerBase adapter performs the existing authoritative
read and gateway/CDC INSERT or conditional UPDATE. UPDATE compares service_id,
format and the exact prior canonical state. There is no local chooser, new
lock, semantic CAS retry loop, timer or permission cache. Existing transport
retry operates on unchanged mutation bytes. A zero-row successful envelope
cannot certify the change. After an uncertain result one authoritative read
resolves a recorded answer or returns UNKNOWN; inability to read after possible
submission does not become a pre-admission refusal.

The authenticated command owner exposes an immutable request-construction
helper, not a new executable command. It consumes its existing tenant/role
validation, captures the complete caller-supplied nonce/request before delivery,
and performs no metadata write. Durable caller retention is still an API
precondition; this helper does not certify external storage. One existing ID
formula is moved to a shared identity module so installation and lineage checks
do not independently derive service identity.

The catalog owner provides a bounded, digest-checked immutable revision/config
projection and existing tenant/artifact eligibility. Selection validates that
projection against the original request. Exact winner replay returns its
original decision; a losing K cannot borrow success; changed winner contents
conflict. Sixteen retained decisions plus the monotonic version fence bound
history without allowing evicted old requests to execute. One selected and at
most one predecessor instance retain nine slots each; counters fail closed at
exhaustion. Request, binding, decision, resource and state encodings have the
approved R2 byte ceilings; malformed/cyclic input and corrupt rows are refused.

Slot reservation, token resolution, metadata grant and metadata closure share
that same row CAS. A current slot retains its ordinal, exact body/token and
phase after closure; closed/evicted identities cannot revive. Two reservations
for the same replica identity in different slots race on one row. A successor
metadata grant is held while any predecessor slot is outstanding. A stale
concurrent grant/close cannot overwrite later selection or another slot.

IMPORTANT: these internal metadata methods are not wired into ordinary CREATE,
serving dispatch or retirement. Their node/replica IDs are captured original
request fields; canonical route/directory alias resolution, retained operation
intent, consensus membership/genesis, local durable grant and RETIRED-before-
CLOSED, joined continuations, last-CLOSED reconciliation wake, and restart
scanning remain the next full lifecycle interaction. A metadata CLOSED reply
alone is not evidence that a native port or physical resource closed. No token
alone authorizes physical serving in this stage. No RF3, process-loss, seed-loss,
snapshot installation or physical multi-host consensus proof is claimed.

## Review findings and local measured development

Preimplementation design review: accept this metadata-only boundary for
measurement under CONTRACT-R2, with full lifecycle receipts still false.
Production consumers will not be redirected until their composed proof exists.

The initial sixteen-case companion was staged as a separate local test-only
checkpoint before the first local candidate measurement. Seven additional
adversarial cases were added during review. The final 23-case companion and the
original nine-case oracle are frozen before the published lab comparison.

First local attempt: all nine original assertions reported pass, but the
existing file runner refused a 1,540,434-byte diagnostic line. The file is RED,
not retrospectively green. Pretty-printing within one diagnostic remained an
oversized line and was also refused. Both raw logs are retained in the cloud
checkpoint. Only the evidence formatter was changed to numbered 4,096-character
chunks of the exact original JSON; concatenating evidenceChunk in offset order
recovers it. No assertion, output limit, timeout or runner implementation changed.

Author review REVISE: a resolution-read failure after an uncertain submission
was escaping as UNAVAILABLE. Corrected to UNKNOWN with the read failure as
reason, and an explicit witness now exercises that boundary. Further review
added request mutation, forged bindings/tokens, lost grant/close replies and
selection/grant plus unrelated-slot/close interleavings. The ordinary tests
use existing command/catalog/gateway/CDC mutation construction and real SQLite;
authoritative reads explicitly adapt to one in-memory component database.

Final local diagnostic run: five files, 63 reported assertions, no failed files:
creation CAS 9; admission/concurrency 23; catalog 19; command 6; schema 6.
Container thermal sensors were unavailable; these local results are not lab
certification. Raw first outcomes and scoped static output are retained.

Scoped ESLint, new-module cyclomatic/cognitive checks, nine-owner literals,
decision and grammar checks pass without added baseline allowances. The impact
registry has 64 contracts and 35 coupled pairs. Canonical classifiers now name
2,397 tests. An initial bounded tool invocation was interrupted during graph
verification; a separate canonical refresh/verify subsequently completed with
exit zero and the same final seal. All shard checks pass. The retained broader
owner-debt analyzer heap failure/global static and corpus holds remain open.
No limits, retries, thermal policy or production deadlines were altered.

## Frozen lab plan and acceptance ceiling

Run the five named files on locked lenovo-laptop with normal existing dependency
profile, classified placement and retry disabled. Record the first result.
Then compare unchanged oracle bytes on a proof-only branch removing only the
prior-state predicate in the metadata UPDATE. That must engage a named race
assertion, not a setup/import/timeout failure. The product branch remains intact.

Only after inspecting source-bound terminal results may author review accept
this metadata transition stage as a basis for continued WIP integration. The
whole creation/genesis Quest, final independent receipt, full change cone,
global static gate and all wider rs-raft release holds remain unchanged.
