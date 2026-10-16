# Message-group first native result: fixture/input boundary failure; custody proof incomplete

Frozen execution: `5a3cdc71854c7d97d2e3b688258b73c19dd0c6e4`, `tv-dator`,
`test/message-group/message-group-native-custody-handoff.test.js`.
Whole file: 0 passing / 1 failing case, exit 1; classified file duration 2,524 ms.
Raw TAP SHA256: `f82369643142af3679151d9ed5cedcc405e4b5a1b620925727e148eb982d3def`.
Read-only classification; no source/test edits and no rerun.

The first assertion failure is `0 !== 1` at test line 146, “exact actual
recipient proposal is retained.” The intended custody assertion and the
leader-loss, suffix-replacement and replay stages were not reached. This is
not a native custody-loss RED and supplies no W07 regression attribution.

## What the retained trace establishes

- Native producer leader committed/applied position 5 and contains the requested
  CONFIG row. Both producer followers hold entry 5 but are committed/applied
  only through 4 at the recorded cut; their absent obligation rows are not
  evidence of retired custody.
- The leader retained `entry:native-cdc-custody-write` as an owed obligation,
  `delivered=false`. Its CDC data is only `{"updated_at_hlc":""}`; the
  `config_key` and `config_value` are absent despite their presence in the SQL
  parameters and the committed source row.
- The delivery lane reports `held_by_subscriber`, delivered 0, retry armed,
  and no pending acknowledgements. The explicit flush returns `empty`.
- All three recipient records remain at commit/applied 1, containing only the
  initial no-op. Their observed CONFIG row is null. No transport-held envelope
  or successful propagation-return event was recorded.

## Exact source-to-fixture explanation

The fixture directly calls `applyWrite` with type `INSERT`, SQL and params,
but without `data` or an owner-created timestamp (test lines 129–133).
That combines the structured INSERT tag with the raw-query payload shape.

`PartitionCDCGenerator.extractCDCData` starts from `entry.data || {}` and only
extracts SQL parameters when the original type is `QUERY`
(`src/partition/partition-cdc-generator.js:340–368`). Consequently this exact
INSERT shape generates an empty data object; `stampOriginHlc` adds the sole
`updated_at_hlc` field (same file:253–258). `buildPartitionWriteEntry` turns an
absent timestamp into `''` (`src/partition/partition-write-kernel.js:243–249`).
`recordCommittedStatementCdc` records the resulting event at the actual
committed position (`src/partition/partition-cdc-obligation.js:123–134`).
These source rules directly explain the malformed event bytes in the trace.

The existing production entry builders do not use this hybrid shape:
`insertData` supplies type INSERT **and data** before `proposeWrite`
(`src/partition/partition-service-write-metrics-base.js:214–238`);
`executeQuery` supplies type QUERY for SQL/params (same file:60–78).
`proposeWrite` obtains the HLC timestamp before calling `applyWrite`
(same file:416–430). The fixture therefore did not preserve the normal
producer-entry composition required for the intended completion/custody proof.

There is a source-consistent pre-proposal refusal route: the recipient calls
`cdcHandler.applyImmediate` before `proposeCDCCommand`
(`src/message-group/message-group-service-cdc-replication-runtime-methods.js:201–238`);
the cache rejects data without its primary key
(`src/cache/system-table-cache.js:283–289`), and `CDCHandler.applyEvent`
rethrows that error (`src/message-group/cdc-handler.js:478–484,515–531`).
The delivery owner retains/retries on subscriber failure
(`src/partition/partition-cdc-obligation-delivery.js:508–520,535–544`).
The raw trace does not retain the original subscriber exception or an entry
observation inside the propagation call, so this particular throw site is a
source-backed explanation, not a separately observed exception stack.

## Scope and stopping disposition

Classify the first result as **fixture/input-boundary failure with custody
coverage incomplete**. Native storage and the producer's failed-delivery
retention did execute. Successful propagation ACK, committed CDC_DELIVERED,
recipient proposal/application, actual loss and exact-event replay did not.
Do not call the observed retained obligation proof of the successful-ACK path.

The separately inspected source concerns remain open, not experimentally
confirmed here: `SeedRuntimeBridgeOwner.propagatePartitionCDCEvent` carries
table/operation/data but omits durable event identity
(`src/bootstrap/owners/seed-runtime-bridge-owner.js:195–211`), and the subscriber
awaits propagation without returning its outcome
(`src/bootstrap/shared/partition-cdc-propagation-subscriber.js:220–228`).
Neither concern may be promoted to demonstrated custody loss from this run.

The existing source builders identify a future reviewed fixture-composition
boundary; no fixture revision or second attempt is made in this packet.
The low-level acceptance of an incomplete INSERT/CDC shape is a distinct
admission/generator interaction question, with native reachability through
normal production callers not established by this direct invocation.
Preserve the failed bytes, raw evidence and unexecuted proof obligations.
