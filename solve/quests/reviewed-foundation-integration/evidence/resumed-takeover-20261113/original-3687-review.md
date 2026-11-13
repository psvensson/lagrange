# Original 3687 independent evidence review

Source-bound closed original, not repaired-candidate acceptance. Reviewed complete native TAP sections and setup/native/final guard records from the fully assembled stream; verbose npm installation material was inspected through its status and diagnostic lines, not treated as test evidence.

Stream: 264616 bytes; SHA-256 f5992c970282c1f23b489ac00d476a93fa5523badd32b2974a30984a272855e7 independently recomputed. Host local-workstation; Node v22.23.2; source 24060f4b393a3f392dd55a7bf0a8f2071c1af04d; tree 74b6b10516573b7e8020ba41c7fd423e0e293bdc; src bc9e83a24cee235aa7fd33ff9777dc97d229903c. Setup 0 (09:51:27–09:51:36 UTC); native provenance 0 (SQLite3.49.2, expected source ID and addon d7d9272b12d11c1dc2bb787741b1b7c4037d336155f316ace3420410c28fda37). Tests 1, ending09:53:12UTC; final source guard0. Closure of execution/container/thermal scopes is a separate provider fact retained by coordinator, not inferred from this stdout.

Two roots,48 top-level cases,39pass9fail; no cancelled/skipped/todo. Both files failed. Native runner assertion count48 is case accounting, not a count of individual JS assertions.

## First divergences

placement-failure-custody.test.js:14cases,13pass1fail. Case14, controller abort after direct exit with inherited descendant output, fails at the bounded closure wait: “explicit abort must close inherited output while its finite descendant is still alive” after about5.1s. This is the first failure in serialized output; concurrent root scheduling means output order alone is not a precise wall-clock failure ordering. Later checks of preserved status/group closure in that test are not established by this failure. Cases1–13 passed acquisition sibling closure, rejected settlement with/without cleanup throw, null/undefined refusal, descriptor acquisition cleanup, real controller statuses, input close/unlink/open failure cleanup and missing-timeout refusal.

test-placement.test.js:34cases,26pass8fail. Failures:
- #24 missing required producer: actual0 versus expected97; declared required preparation did not refuse. Later forbidden-runner assertions cannot be credited.
- #28 real locked checkout after child0: actual0 versus97. Child log confirms real lock and child0; cleanup refusal did not remain adverse. Later byte-retention checks not reached.
- #29 real locked checkout after child42: status assertion precedes failed retained-checkout assertion, so first42 survived; checkout missing at first retention check. No complete retained-byte proof.
- #30 subsequent assignment: first retention assertion reports prior checkout absent. No complete sibling-input preservation claim.
- #31 colliding controller attempt: actual0 versus97; logged finite child executed successfully. Subsequent original-byte assertions not reached.
- #32 colliding remote attempt: expected explicit attempt-exists diagnostic absent; output only placement-shell PID. Do not infer every later byte-preservation assertion failed.
- #33 preparation cancellation and #34 TERM-ignoring runner/descendant cancellation: both actual null status versus143, reason interrupted. Their later group/no-runner assertions are not established; do not translate null to successful shutdown or143.

Positive cases1–23 and25–27 passed, including exact throwaway checkout, machine-wide lock and busy refusal, stream/results relay, real import-graph generation/sealed graph, split planning/merge, named commit and thermal-unavailable accounting. These bounded fixture successes do not prove actual LAN peer placement or whole-corpus acceptance.

## Relation to retained candidate

Current d081 candidate has explicit required-generator check in placement-shell.js236–239; retained original/uncertain cleanup with first_status preservation at98–128; collision refusals at158–175; owned phase cancellation and closure at64–96,130–137,218–232; exclusive controller acquisition in placement-execution; controller abort guarded by observed close rather than direct exit in placement-execution. These are source correspondences to the measured original boundaries, not measured repairs.

Exact original source24060f4b is absent from the root clone object store at review time (git show refused). Therefore this note does not claim an independently completed original implementation causal trace; coordinator should supply that object before binding each source cause. The original log is complete and its nine failures remain primary. No rerun, project execution, repository edit or external write performed.

## Original source supplement after coordinator's native fetch

Coordinator subsequently supplied exact24060f4b in root object store; original source/test bodies were then inspected. The earlier object-availability ceiling is resolved for the following bounded causal trace:

- probe.js1878–1889 wraps required generation in `if [ -f producer ]`; missing producer skips preparation and proceeds. This directly explains case24's0 rather than97.
- probe.js1794–1797 discards Git removal stderr/status, then forcibly rm-rf's the checkout and prunes/deletes ref and inputs unconditionally. Case28 clean execution remains0 despite real locked removal refusal; case29 retains42 but loses checkout. Both derive from the same cleanup contract, not unrelated test-local defects.
- probe.js1828–1836 sweeps earlier parent entries and placement refs before admission. This explains case30's prior checkout disappearance. Case32's original status97 assertion passed, but explicit collision diagnostic failed: no admission guard exists and later ordinary worktree failure is not an honest collision receipt. Later preservation claims remain unmeasured.
- probe.js2210 writes the controller script without exclusive creation; wrapper log acquisition also predates exclusive ownership. Case31 reached the finite runner and returned0 rather than refusing, consistent with missing attempt identity acquisition.
- probe.js2255–2265 sets returned status to null whenever stopped; this directly explains cases33/34's null vs143 regardless of whether shell itself ended143. Source additionally lacks acquired preparation process-group custody: preparation is foreground; stop addresses only runner pid, and TERM-ignoring descendants are not bounded by that shell owner. Physical first failures occur at status assertions, so these later cancellation defects remain source findings, not passed/failed downstream physical checks.
- probe.js2533–2535 aborts only while direct child has not exited, although done awaits closeOf(child). Original fixture acknowledges actual direct exit42 and a live same-group inherited-output descendant before abort. That early return explains the bounded output-closure failure in placement-failure-custody case14.

These are publication/placement custody-owner failures across producer admission, attempt acquisition, cleanup and process-group observation. Current candidate source addresses those boundaries, but no repaired candidate result is supplied by original3687.
