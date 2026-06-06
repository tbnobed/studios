'use strict';

// Turns the browser's PROGRESSIVE frames into 1080i59.94 INTERLACED frames.
//
// 1080i59.94 = 59.94 fields/s = 29.97 interlaced frames/s. Each interlaced
// frame carries two temporally-distinct fields:
//   - the upper field (even scanlines 0,2,4,...) from progressive frame A
//   - the lower field (odd  scanlines 1,3,5,...) from progressive frame B
//
// "Upper field first" (field-1-dominant) is the standard for 1080i. If motion
// looks combed/juddery on real hardware, flip FIELD_ORDER.

const FIELD_ORDER = 'upper-first'; // or 'lower-first'

class FieldWeaver {
  /**
   * @param {number} width   output width in pixels (1920)
   * @param {number} height  output height in pixels (1080)
   * @param {(bgra: Buffer) => void} onFrame  receives one interlaced BGRA frame
   */
  constructor(width, height, onFrame) {
    this.width = width;
    this.height = height;
    this.onFrame = onFrame;
    this.rowBytes = width * 4; // BGRA, 8-bit
    this.pending = null; // first progressive frame of the pair (field A)
  }

  /**
   * Feed one progressive BGRA frame (as produced by Electron's paint bitmap).
   * Every second call emits one woven interlaced frame.
   * @param {Buffer} bgra
   */
  pushProgressive(bgra) {
    // Guard against size mismatches (e.g. a stray paint at the wrong size).
    if (bgra.length !== this.rowBytes * this.height) return;

    if (!this.pending) {
      this.pending = Buffer.from(bgra); // copy: the source buffer is reused
      return;
    }

    const fieldA = FIELD_ORDER === 'upper-first' ? this.pending : bgra;
    const fieldB = FIELD_ORDER === 'upper-first' ? bgra : this.pending;

    const out = Buffer.allocUnsafe(this.rowBytes * this.height);
    for (let y = 0; y < this.height; y++) {
      const src = y % 2 === 0 ? fieldA : fieldB;
      src.copy(out, y * this.rowBytes, y * this.rowBytes, (y + 1) * this.rowBytes);
    }

    this.pending = null;
    this.onFrame(out);
  }
}

module.exports = { FieldWeaver, FIELD_ORDER };
