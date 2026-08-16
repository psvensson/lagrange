/**
 * Projection-evidence source allowlist and loud source rejection.
 *
 * The live readiness call sites spread their ENTIRE evaluation context
 * into buildProjectionReadinessEvidence, whose strict own-data
 * normalization silently replaced the whole record with the empty one
 * when ANY reachable value — including fields the builder never reads,
 * like raw cache rows — violated the plain-data rules. The result was
 * the serve lane's everything-false degenerate state masquerading as
 * owner_evidence_missing, wedging the lone seed out of serve
 * eligibility with no diagnosable signal (round-13; runs 08-18-24 and
 * predecessors on 2026-08-16). The evidence builder now (a) picks only
 * the fields it actually reads before validating, so never-read context
 * fields cannot veto the contract, and (b) when the picked source
 * itself fails validation, reports it loudly as a distinct
 * projection_contract_source_invalid reason instead of cosplaying as
 * missing evidence.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  buildProjectionReadinessEvidence,
  pickProjectionReadinessEvidenceSource,
} from '../../src/control-plane/projection-readiness-evidence.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

function buildCleanSource() {
  return {
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
    },
    runtimeAuthority: {
      processAlive: true,
      clusterMemberHealthy: true,
      repairEligible: true,
      writeEligible: true,
    },
    runtimeServeEligible: true,
  };
}

test('the producer pick strips never-read fields so their junk cannot ' +
  'veto the sealed whole-source validation', (t) => {
  const evidence = buildProjectionReadinessEvidence(
    pickProjectionReadinessEvidenceSource({
      ...buildCleanSource(),
      serviceRows: new Map([['a', 1]]),
      nodeRow: new Date(0),
      capacity: () => {},
    }),
  );
  t.equal(evidence.ownerEvidenceAvailable, true,
    'the evidence stays available despite non-plain never-read fields');
  t.equal(evidence.processAlive, true,
    'the clean allowlisted fields evaluate normally');
  t.equal(evidence.sourceInvalid, false,
    'a stripped never-read field is not a source rejection');
  t.end();
});

test('the sealed builder still fails the whole record closed when junk ' +
  'reaches it unpicked', (t) => {
  const evidence = buildProjectionReadinessEvidence({
    ...buildCleanSource(),
    serviceRows: new Map([['a', 1]]),
  });
  t.equal(evidence.ownerEvidenceAvailable, false,
    'the sealed whole-source own-data rule is unchanged');
  t.equal(evidence.sourceInvalid, true,
    'and the rejection is now loudly flagged');
  t.end();
});

test('the pick skips an own accessor without executing it', (t) => {
  const source = {runtimeServeEligible: true};
  let executed = false;
  Object.defineProperty(source, 'dimensions', {
    configurable: true,
    enumerable: true,
    get() {
      executed = true;
      return {};
    },
  });
  const picked = pickProjectionReadinessEvidenceSource(source);
  const evidence = buildProjectionReadinessEvidence(picked);
  t.equal(executed, false, 'the own getter is never executed');
  t.equal(Object.hasOwn(picked, 'dimensions'), false,
    'the accessor field is absent from the picked record');
  t.equal(evidence.sourceInvalid, false,
    'a skipped accessor is missing evidence, not a rejection');
  t.end();
});

test('junk inside an allowlisted field is a loud, distinct rejection',
  (t) => {
    const evidence = buildProjectionReadinessEvidence({
      ...buildCleanSource(),
      dimensions: {poisoned: new Map()},
    });
    t.equal(evidence.sourceInvalid, true,
      'the rejected source is flagged');
    t.ok(
      evidence.reasonSeed.includes('projection_contract_source_invalid'),
      'the rejection carries its own reason code, not owner_evidence_missing');
    t.equal(evidence.ownerEvidenceAvailable, false,
      'a rejected source still fails closed');
    t.end();
  });

test('a clean source keeps its sealed behavior', (t) => {
  const evidence = buildProjectionReadinessEvidence(buildCleanSource());
  t.equal(evidence.ownerEvidenceAvailable, true);
  t.equal(evidence.sourceInvalid, false);
  t.equal(evidence.reasonSeed.length, 0, 'no seeded reasons when healthy');
  t.end();
});

test('an absent source still reports owner evidence missing, not source ' +
  'invalid', (t) => {
  const evidence = buildProjectionReadinessEvidence({});
  t.equal(evidence.ownerEvidenceAvailable, false);
  t.equal(evidence.sourceInvalid, false,
    'an empty source is honestly missing, not invalid');
  t.ok(evidence.reasonSeed.includes('owner_evidence_missing'),
    'missing evidence keeps its sealed reason');
  t.end();
});
