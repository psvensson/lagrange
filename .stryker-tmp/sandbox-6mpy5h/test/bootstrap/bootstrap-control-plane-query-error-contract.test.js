// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';

function createBootstrapApi() {
  const api = Object.create(BootstrapAPI.prototype);
  api.bootstrapAdmissionRetryAfterMs = 1500;
  return api;
}

test('BootstrapAPI builds explicit pressure details for retryable control-plane errors',
  async (t) => {
    const api = createBootstrapApi();

    const error = api.buildBootstrapControlPlaneQueryError({
      success: false,
      retryable: true,
      error: 'bootstrap-not-ready',
      errorCode: 'BOOTSTRAP_NOT_READY',
      pressureAction: 'retry_later',
      pressureReason: 'control_plane_backpressure',
      pressureSummary: 'seed is still converging',
      retryAfterMs: 900,
      tableName: 'services',
    }, 'fallback');

    t.equal(error.retryAfterMs, 900);
    t.same(
      error.details.pressure,
      {
        state: 'present',
        action: 'retry_later',
        reason: 'control_plane_backpressure',
        summary: 'seed is still converging',
      },
      'retryable bootstrap errors should expose explicit pressure state',
    );
    t.equal(error.details.pressureAction, 'retry_later');
    t.equal(error.details.pressureReason, 'control_plane_backpressure');
    t.equal(error.details.pressureSummary, 'seed is still converging');
    t.equal(error.details.tableName, 'services');
  });

test('BootstrapAPI builds an explicit no-pressure descriptor when absent',
  async (t) => {
    const api = createBootstrapApi();

    const error = api.buildBootstrapControlPlaneQueryError({
      success: false,
      retryAfterMs: 1200,
      error: 'bootstrap-not-ready',
    }, 'fallback');

    t.same(
      error.details.pressure,
      {
        state: 'none',
      },
      'retryable bootstrap errors should not use missing keys as implicit no-pressure state',
    );
    t.equal('pressureAction' in error.details, false);
    t.equal('pressureReason' in error.details, false);
    t.equal('pressureSummary' in error.details, false);
  });
