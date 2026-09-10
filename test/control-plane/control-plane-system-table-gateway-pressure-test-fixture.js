import {PressureGovernor} from
  '../../src/control-plane/pressure-governor.js';

// Gateway tests assert how an already-decided pressure disposition crosses the
// gateway boundary. Keep the real PressureGovernor policy (`evaluate`) while
// omitting its independently-tested admission-queue deadline from this unit.
function createImmediatePressureGovernor(options = {}) {
  const governor = new PressureGovernor(options);
  governor.admit = function admitImmediately(request = {}) {
    return Promise.resolve(this.evaluate(request));
  };
  return governor;
}

export {createImmediatePressureGovernor};
