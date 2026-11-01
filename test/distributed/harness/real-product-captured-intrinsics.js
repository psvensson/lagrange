/**
 * Module-load captures of the prototype methods the comparative-benchmark
 * deployment and campaign owners call on external data (ssh output, product
 * answers, inventory records). Captured once here so a replaced intrinsic
 * cannot invert a readiness, identity or dataset decision
 * (adversarial-js-intrinsics guideline, template item 6).
 */
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringLastIndexOf = Function.call.bind(String.prototype.lastIndexOf);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringTrim = Function.call.bind(String.prototype.trim);

export {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayFlatMap,
  arrayIncludes,
  arrayJoin,
  arrayMap,
  arraySome,
  stringEndsWith,
  stringIncludes,
  stringIndexOf,
  stringLastIndexOf,
  stringReplace,
  stringSplit,
  stringStartsWith,
  stringToLowerCase,
  stringTrim,
};
