/**
 * Owner contract:
 * Owner: ControlPlaneReadinessService owns node readiness and planning surfaces.
 * Inputs: injected metadata owners, node rows, service rows, cache, runtime evidence.
 * Canonical output: readiness, membership-planning, startup, and recovery-health answers.
 * Prohibited fallbacks: no raw cache authority or sync owner bypass for planning state.
 * Primary tests: test/control-plane/control-plane-readiness-service.test.js.
 */
export {
  ControlPlaneReadinessServiceSegment4 as ControlPlaneReadinessService,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
} from './control-plane-readiness-service-segment-4.js';
