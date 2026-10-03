import {
  MAX_EVALUATION_CONTEXT_VALUES,
  cloneStringArray,
} from './partition-split-merge-manager-core-methods.js';

const LOCAL_STR_STRING = 'string';
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const objectDefineProperty = Object.defineProperty;

function appendOwnArrayValue(array, value) {
  objectDefineProperty(array, array.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function mergeBoundedStringArrays(
  existingValues,
  nextValues,
  requiredValue = null,
) {
  const existing = cloneStringArray(existingValues);
  const next = cloneStringArray(nextValues);
  const merged = [];

  const appendSource = (source) => {
    for (let index = 0;
      index < source.length && merged.length < MAX_EVALUATION_CONTEXT_VALUES;
      index += 1) {
      const value = source[index];
      if (!arrayIncludes(merged, value)) {
        appendOwnArrayValue(merged, value);
      }
    }
  };

  appendSource(existing);
  appendSource(next);

  const requiredPresent =
    typeof requiredValue === LOCAL_STR_STRING &&
    (arrayIncludes(existing, requiredValue) ||
      arrayIncludes(next, requiredValue));
  if (requiredPresent && !arrayIncludes(merged, requiredValue)) {
    if (merged.length < MAX_EVALUATION_CONTEXT_VALUES) {
      appendOwnArrayValue(merged, requiredValue);
    } else if (merged.length > 0) {
      objectDefineProperty(merged, merged.length - 1, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: requiredValue,
      });
    }
  }

  return merged;
}

export {mergeBoundedStringArrays};
