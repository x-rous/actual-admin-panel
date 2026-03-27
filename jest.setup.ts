import '@testing-library/jest-dom'

// structuredClone is available in Node 17+ but may be missing in some jsdom
// versions. Polyfill it so store tests that use it can run in all environments.
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(val: T): T => JSON.parse(JSON.stringify(val));
}