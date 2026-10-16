# R2 schema-registration stage: author review for measurement

Continuation requested by the operator on 16 October 2026, with this ChatGPT
session acting as reviewer between stages. This is author review, not an
independent receipt or a terminal Quest/release approval.

## Boundary and review

ACCEPT FOR LAB MEASUREMENT: register one service_instances table using the
existing TABLES, bootstrap schema and initial partition/replica registries.
The service_id TEXT primary key, required format INTEGER and required state
TEXT have no default capable of inventing authority. Explicit notNull is
retained on the key in both bootstrap DDL and the ordinary per-replica creator.
The existing primary-key descriptor consumes the schema; no competing key
registry is added. CDC cache projection uses that same key. Internal hydration
and propagation are enabled, external CDC is disabled, and readinessRelevant
remains false: serving permission will require the authoritative row owner.

Scope is schema/registration/projection only. No SELECTED result, serving grant,
new revision history, runtime creation, genesis, member admission or full-cluster
startup is implemented or certified here. Existing activation refusals remain.
There is no migration requirement for old development layouts under the alpha
clean-break decision; current malformed-input checks are not waived.

## Local evidence retained before remote measurement

Local workspace source/test baseline cb4238cfbd1718969b41a0558e384a5feaa73e07
imports the published 6e7eb3d3 source/test bytes onto the retained Git ancestry;
the two intervening remote Markdown evidence files were not imported. This is
NOT the remote ed4707a2 commit. The publication patch applies to real remote
ed4707a2 ancestry and preserves those documents. Do not claim the imported local
commit itself was a remote lab candidate.

The first four-case registration witness failed all four cases against missing
production registration before the production edit. A subsequent review added
real per-replica DDL and existing SystemTableCache projection observations;
these two added cases are not falsely described as part of the first baseline.
All six final cases pass locally. The original nine creation CAS oracle bodies
remain unchanged. They now complete actual component catalog installation but
stop at the still-missing selectConsensusInstance method. This is capability
progress, not a semantic CAS safety proof or an overall green creation suite.

Final local classified selection: four files pass, 344 reported assertions:
service-instance schema 6, default cache selection 217, artifact schemas 26,
WASM metadata schemas 95. The container reports thermal sensors unmeasurable.
This is local diagnostic execution, not lab-host or native RF3 evidence.
Canonical metadata refresh completed for 2396 test files and refreshed the
import-graph seal. Scoped lint passed. Full global owner-debt regeneration,
whole-corpus/static acceptance, and all larger Quest receipts remain OPEN.
No test timeout, retry, threshold, or admission policy was weakened.

## Next boundary

ServiceDefinitionsOwner must arbitrate selection and resource slots with one
conditional mutation through SystemMetadataOwnerBase/gateway/CDC. Historical
request outcomes must not be confused with current permission. Unknown mutation
answers must resolve the original identity without recomputing another CAS.
The new schema alone does not implement or approve that next interaction.
