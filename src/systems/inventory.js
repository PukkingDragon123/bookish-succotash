// Resource bag. Wood is special: it is physically carried on the ferret's back
// with a hard cap of 10 pieces, so `add('wood', n)` can partially fail and the
// caller has to deal with the overflow.

import { RESOURCES } from './defs.js';

export class Inventory {
  constructor() {
    this.items = Object.create(null);
    this.caps = Object.create(null);
    for (const k of Object.keys(RESOURCES)) {
      this.items[k] = 0;
      if (RESOURCES[k].carry) this.caps[k] = RESOURCES[k].carry;
    }
    this.onChange = null;
  }

  get(k) { return this.items[k] || 0; }
  cap(k) { return this.caps[k] == null ? Infinity : this.caps[k]; }
  isFull(k) { return this.get(k) >= this.cap(k); }
  setCap(k, v) { this.caps[k] = v; }

  /** Returns how many were actually accepted. */
  add(k, n = 1) {
    if (!(k in this.items)) this.items[k] = 0;
    const cap = this.cap(k);
    const before = this.items[k];
    const after = Math.min(cap, before + n);
    this.items[k] = after;
    if (after !== before && this.onChange) this.onChange(k, after - before);
    return after - before;
  }

  has(k, n = 1) { return this.get(k) >= n; }

  hasAll(costObj) {
    for (const k in costObj) if (this.get(k) < costObj[k]) return false;
    return true;
  }

  /** Returns true if the whole amount was removed. */
  take(k, n = 1) {
    if (this.get(k) < n) return false;
    this.items[k] -= n;
    if (this.onChange) this.onChange(k, -n);
    return true;
  }

  takeAll(costObj) {
    if (!this.hasAll(costObj)) return false;
    for (const k in costObj) this.take(k, costObj[k]);
    return true;
  }

  /** Everything the player is holding, as [key, count] pairs, non-zero only. */
  entries() {
    const out = [];
    for (const k in this.items) if (this.items[k] > 0) out.push([k, this.items[k]]);
    return out;
  }

  total() {
    let n = 0;
    for (const k in this.items) n += this.items[k];
    return n;
  }
}
