// Simple version of {mock} from node:test. Bun doesn't support node:test yet.
// Eventually the tests should get migrated to either jest or node:test since
// those will work in both bun and node
export const mock = {
  undo: [],
  method(target, key, impl) {
    const old = target[key];
    target[key] = impl;
    this.undo.push(() => target[key] = old);
  },
  reset() {
    for (const fn of this.undo.reverse()) fn();
    this.undo.length = 0;
  }
};
