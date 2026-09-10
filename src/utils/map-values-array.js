const arrayFrom = Array.from;
const MapConstructor = Map;
const mapValues = Function.call.bind(Map.prototype.values);
const objectGetPrototypeOf = Object.getPrototypeOf;
const symbolIterator = Symbol.iterator;
const mapIteratorNext = Function.call.bind(
  objectGetPrototypeOf(mapValues(new MapConstructor())).next,
);

// Array.from uses CreateDataProperty for each result slot, avoiding both live
// Array prototype setters and the much slower per-row Object.defineProperty
// loop. The wrapper supplies captured Map iteration intrinsics so later
// prototype mutation cannot redirect the trusted shadow walk.
function copyMapValuesToArray(map) {
  const sourceIterator = mapValues(map);
  const trustedIterator = {
    [symbolIterator]() {
      return trustedIterator;
    },
    next() {
      return mapIteratorNext(sourceIterator);
    },
  };
  return arrayFrom(trustedIterator);
}

export {copyMapValuesToArray};
