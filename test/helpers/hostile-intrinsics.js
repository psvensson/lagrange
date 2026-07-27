// Reusable hostile-intrinsics mutation fixtures for adversarial verification
// of guard/contract modules (the attack class catalogued in
// docs/steering/verification-templates/adversarial-js-intrinsics.md).
//
// Each helper mutates a prototype or intrinsic and returns a restore closure;
// `withHostileIntrinsics` applies a batch, runs the assertion callback, and
// restores in reverse order even when the callback throws — so a failing
// assertion can never leak a polluted intrinsic into later tests. The helpers
// capture the intrinsics they need at module load, before any test pollutes
// them.

const helperObjectDefineProperty = Object.defineProperty;
const helperObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;

function replacePrototypeDescriptor(prototype, field, replacement) {
  const descriptor = helperObjectGetOwnPropertyDescriptor(prototype, field);
  helperObjectDefineProperty(prototype, field, replacement);
  return () => {
    if (descriptor) {
      helperObjectDefineProperty(prototype, field, descriptor);
    } else {
      delete prototype[field];
    }
  };
}

export function replacePrototypeProperty(prototype, field, value) {
  return replacePrototypeDescriptor(prototype, field, {
    configurable: true,
    writable: true,
    value,
  });
}

// Pollution: a property the clean prototype does NOT define, visible to every
// object inheriting from it (the classic Object.prototype injection).
export function pollutePrototypeProperty(prototype, field, value) {
  return replacePrototypeDescriptor(prototype, field, {
    configurable: true,
    enumerable: false,
    writable: true,
    value,
  });
}

// An inherited accessor on a numeric index or named key, intercepting reads
// and writes that reach the prototype (fresh-array assignment interception).
export function polluteWithAccessor(prototype, field, {get, set}) {
  const descriptor = helperObjectGetOwnPropertyDescriptor(prototype, field);
  helperObjectDefineProperty(prototype, field, {
    configurable: true,
    ...(get ? {get} : {}),
    ...(set ? {set} : {}),
  });
  return () => {
    if (descriptor) {
      helperObjectDefineProperty(prototype, field, descriptor);
    } else {
      delete prototype[field];
    }
  };
}

// Run `callback` with a batch of already-applied mutations (their restore
// closures), always restoring in reverse order — a throwing assertion can
// never leak a polluted intrinsic into later tests.
export function withHostileIntrinsics(restores, callback) {
  try {
    return callback();
  } finally {
    for (let index = restores.length - 1; index >= 0; index -= 1) {
      restores[index]();
    }
  }
}
