# Verifier mutation plan (stage 1c), each applied once in verify-1c, restored byte-identically

Re-runs of the implementer's set (required: M18, M19a, M19b, five of M01-M17):
- VM18  skip authority confirmation for PUBLISHED_UNPROJECTED: service-consensus-bootstrap.js
        `if (!SERVING_STATUSES.has(confirmed.status)) return confirmed;` -> `if (confirmed.status !== CONSENSUS_BOOTSTRAP.PUBLISHED) return confirmed;`
        catchers: wasm-creation-publication.integration (P11); runtime-service-bound-route (Revision 4 test)
- VM19  request-cell predicate by key presence (old body) in request-cell-runtime-contract.js
        catchers: request-cell-definition-classification (a); runtime-service-bound-route (b)
- VM01  HELD mapped to FAIL: RESUME_STATUS HELD -> DECISION.FAILED (route module)        catcher: bound-route
- VM03  resume passes the retained RESULT object to prepare instead of recover: in service-consensus-bootstrap.js
        resumeConsensusCreation -> `continueRetainedCreation(manager, await prepareConsensusCreation(manager, await recoverConsensusCreation(...)))`  catcher: bound-route
- VM06  endpoint id by S: wiring `endpointKey: replicaId` -> `endpointKey: consensusBinding.serviceDefinitionId`  catcher: publication unit (row id, cell d)
- VM11  recover-for-REMOVE: route module decideBoundRemoval uses manager.recoverConsensusCreation  catcher: bound-route (C6-8/(b), cell c)
- VM13  remover parses S: remover ignores consensusBinding  catcher: publication unit cell (d)

Semantic-class additions named by the brief:
- VA1  mark keyed by S (= M17): enableServicesRowPublication ignores the token digest  catcher: C6 native (token-mismatch mark) / publication unit "mark that finds no matching creation"
- VA2  raw nodeAddress as host (= M16): startup wiring `endpointHost` returns node.nodeAddress  catcher: publication unit cell (e) / C6 native
- VA3  remover parses S (= VM13)
- VA4  absent writer treated as PRESENT (= M15): projectPublishedConsensus skips the writer-absent check  catcher: publication unit cell (i)
- VA5  recover-for-REMOVE (= VM11)
- VA6  UNAVAILABLE deferral applied to a non-bound-class CREATE (= M12): route module skips isBoundClassDefinition  catcher: bound-route (native_js generic; cell a)
- VA7  HELD re-entry without the in-progress guard: reenterHeldCreation always schedules  catcher: bound-route F9
- VA8  PRESENT replay twice: markServicesRowPresent replays even when ALREADY_PRESENT  catcher: C6 native (h) / publication unit "one mark"
