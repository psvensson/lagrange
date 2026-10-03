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

function mergeEvaluationContextStringArrays(
  existingValues,
  nextValues,
  options = {},
) {
  const existing = cloneStringArray(existingValues);
  const next = cloneStringArray(nextValues);
  const priorityValue =
    typeof options.priorityValue === LOCAL_STR_STRING &&
    options.priorityValue.length > 0 ?
      options.priorityValue :
      null;
  const ordinaryLimit = priorityValue === null ?
    MAX_EVALUATION_CONTEXT_VALUES :
    MAX_EVALUATION_CONTEXT_VALUES - 1;
  const merged = [];
  let priorityPresent = false;

  const appendSource = (source) => {
    for (let index = 0; index < source.length; index += 1) {
      const value = source[index];
      if (priorityValue !== null && value === priorityValue) {
        priorityPresent = true;
        continue;
      }
      if (merged.length >= ordinaryLimit ||
          arrayIncludes(merged, value)) {
        continue;
      }
      appendOwnArrayValue(merged, value);
    }
  };

  appendSource(existing);
  appendSource(next);

  if (priorityPresent) {
    appendOwnArrayValue(merged, priorityValue);
  }
  return merged;
}

const mergeBoundedStringArrays = mergeEvaluationContextStringArrays;

export {
  mergeBoundedStringArrays,
  mergeEvaluationContextStringArrays,
};
