// A self namespace exposes nonproxy descriptors whose bindings are still in TDZ.
// Capture runs after the refusal outcome is available but before detail bindings.
import * as pending from './participant-release-control-refusal-uninitialized-fixture.js';
import {captureParticipantControlRefusal} from
  '../../src/node/participant-release-diagnostic-observation.js';

export const outcome = 'unavailable';
export const beforeInitialization = captureParticipantControlRefusal(pending);
export const missingFact = 'initialized later';
export const phase = 'initialized later';
export const reason = 'initialized later';
