import type { MultiviewerLayoutType } from "@shared/schema";

// A single tile's placement inside a layout, expressed as a CSS-grid area.
// r/c are 1-indexed start row/column; rs/cs are the row/column spans.
export type LayoutCell = { r: number; c: number; rs: number; cs: number };

export type LayoutGroup = "Basic" | "Spotlight" | "Rows" | "Columns";

export type LayoutDef = {
  type: MultiviewerLayoutType;
  label: string;
  group: LayoutGroup;
  cols: number;
  rows: number;
  // Ordered list of tiles. The index into this array is the slot index, so the
  // order here is the canonical assignment order for a layout's `slots`.
  cells: LayoutCell[];
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);
const lcmAll = (xs: number[]): number => xs.reduce((a, b) => lcm(a, b), 1);

// Tiles stacked in horizontal rows. `counts[i]` = number of equal-width tiles
// in row i (top to bottom). All rows share the same height.
function hStack(counts: number[]): { cols: number; rows: number; cells: LayoutCell[] } {
  const cols = lcmAll(counts);
  const cells: LayoutCell[] = [];
  counts.forEach((count, i) => {
    const span = cols / count;
    for (let k = 0; k < count; k++) {
      cells.push({ r: i + 1, c: k * span + 1, rs: 1, cs: span });
    }
  });
  return { cols, rows: counts.length, cells };
}

// Tiles arranged in vertical columns. `counts[j]` = number of equal-height
// tiles in column j (left to right). All columns share the same width.
function vStack(counts: number[]): { cols: number; rows: number; cells: LayoutCell[] } {
  const rows = lcmAll(counts);
  const cells: LayoutCell[] = [];
  counts.forEach((count, j) => {
    const span = rows / count;
    for (let k = 0; k < count; k++) {
      cells.push({ r: k * span + 1, c: j + 1, rs: span, cs: 1 });
    }
  });
  return { cols: counts.length, rows, cells };
}

const grid = (n: number) => hStack(Array.from({ length: n }, () => n));

const cell = (r: number, c: number, rs = 1, cs = 1): LayoutCell => ({ r, c, rs, cs });

// Four small tiles filling a 2x2 quadrant whose top-left corner is (r, c).
const quadrant = (r: number, c: number): LayoutCell[] => [
  cell(r, c),
  cell(r, c + 1),
  cell(r + 1, c),
  cell(r + 1, c + 1),
];

function def(
  type: MultiviewerLayoutType,
  label: string,
  group: LayoutGroup,
  shape: { cols: number; rows: number; cells: LayoutCell[] }
): LayoutDef {
  return { type, label, group, ...shape };
}

export const LAYOUT_DEFS: LayoutDef[] = [
  // --- Basic equal grids ---
  def("1x1", "1 × 1", "Basic", grid(1)),
  def("2x2", "2 × 2", "Basic", grid(2)),
  def("3x3", "3 × 3", "Basic", grid(3)),
  def("4x4", "4 × 4", "Basic", grid(4)),

  // --- Spotlight (one large tile + supporting tiles) ---
  // "featured": one large tile across the top, a row of six beneath it.
  def("featured", "Featured", "Spotlight", {
    cols: 6,
    rows: 4,
    cells: [
      cell(1, 1, 3, 6),
      cell(4, 1),
      cell(4, 2),
      cell(4, 3),
      cell(4, 4),
      cell(4, 5),
      cell(4, 6),
    ],
  }),
  def("ULeft", "Up Left", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      cell(1, 1, 2, 2),
      cell(1, 3), cell(1, 4), cell(2, 3), cell(2, 4),
      cell(3, 1), cell(3, 2), cell(3, 3), cell(3, 4),
      cell(4, 1), cell(4, 2), cell(4, 3), cell(4, 4),
    ],
  }),
  def("URight", "Up Right", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      cell(1, 3, 2, 2),
      cell(1, 1), cell(1, 2), cell(2, 1), cell(2, 2),
      cell(3, 1), cell(3, 2), cell(3, 3), cell(3, 4),
      cell(4, 1), cell(4, 2), cell(4, 3), cell(4, 4),
    ],
  }),
  def("DLeft", "Down Left", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      cell(3, 1, 2, 2),
      cell(1, 1), cell(1, 2), cell(1, 3), cell(1, 4),
      cell(2, 1), cell(2, 2), cell(2, 3), cell(2, 4),
      cell(3, 3), cell(3, 4), cell(4, 3), cell(4, 4),
    ],
  }),
  def("DRight", "Down Right", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      cell(3, 3, 2, 2),
      cell(1, 1), cell(1, 2), cell(1, 3), cell(1, 4),
      cell(2, 1), cell(2, 2), cell(2, 3), cell(2, 4),
      cell(3, 1), cell(3, 2), cell(4, 1), cell(4, 2),
    ],
  }),
  def("Left", "Left", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      cell(2, 1, 2, 2),
      cell(1, 1), cell(1, 2), cell(1, 3), cell(1, 4),
      cell(2, 3), cell(2, 4), cell(3, 3), cell(3, 4),
      cell(4, 1), cell(4, 2), cell(4, 3), cell(4, 4),
    ],
  }),
  def("Right", "Right", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      cell(2, 3, 2, 2),
      cell(1, 1), cell(1, 2), cell(1, 3), cell(1, 4),
      cell(2, 1), cell(2, 2), cell(3, 1), cell(3, 2),
      cell(4, 1), cell(4, 2), cell(4, 3), cell(4, 4),
    ],
  }),
  // Three large quadrants + one quadrant split into four small tiles.
  def("QuadLR", "Quad LR", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      cell(1, 1, 2, 2), cell(1, 3, 2, 2), cell(3, 1, 2, 2),
      ...quadrant(3, 3),
    ],
  }),
  def("QuadUL", "Quad UL", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      ...quadrant(1, 1),
      cell(1, 3, 2, 2), cell(3, 1, 2, 2), cell(3, 3, 2, 2),
    ],
  }),
  def("QuadUR", "Quad UR", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      cell(1, 1, 2, 2),
      ...quadrant(1, 3),
      cell(3, 1, 2, 2), cell(3, 3, 2, 2),
    ],
  }),
  def("QuadLL", "Quad LL", "Spotlight", {
    cols: 4,
    rows: 4,
    cells: [
      cell(1, 1, 2, 2), cell(1, 3, 2, 2),
      ...quadrant(3, 1),
      cell(3, 3, 2, 2),
    ],
  }),

  // --- Rows (horizontal bands) ---
  def("H2", "H 2", "Rows", hStack([2])),
  def("H3", "H 3", "Rows", hStack([3])),
  def("H4", "H 4", "Rows", hStack([4])),
  def("H1-2", "H 1-2", "Rows", hStack([1, 2])),
  def("H2-1", "H 2-1", "Rows", hStack([2, 1])),
  def("H1-3", "H 1-3", "Rows", hStack([1, 3])),
  def("H3-1", "H 3-1", "Rows", hStack([3, 1])),
  def("H2-3", "H 2-3", "Rows", hStack([2, 3])),
  def("H3-2", "H 3-2", "Rows", hStack([3, 2])),
  def("H2-4", "H 2-4", "Rows", hStack([2, 4])),
  def("H4-2", "H 4-2", "Rows", hStack([4, 2])),
  def("H3-3", "H 3-3", "Rows", hStack([3, 3])),
  def("H3-4", "H 3-4", "Rows", hStack([3, 4])),
  def("H4-3", "H 4-3", "Rows", hStack([4, 3])),
  def("H4-4", "H 4-4", "Rows", hStack([4, 4])),
  def("H2-4-4", "H 2-4-4", "Rows", hStack([2, 4, 4])),
  def("H4-2-4", "H 4-2-4", "Rows", hStack([4, 2, 4])),
  def("H4-4-2", "H 4-4-2", "Rows", hStack([4, 4, 2])),
  def("H2-5-5", "H 2-5-5", "Rows", hStack([2, 5, 5])),
  def("H2-6-6", "H 2-6-6", "Rows", hStack([2, 6, 6])),
  def("H4-4-4", "H 4-4-4", "Rows", hStack([4, 4, 4])),

  // --- Columns (vertical bands) ---
  def("V2", "V 2", "Columns", vStack([2])),
  def("V3", "V 3", "Columns", vStack([3])),
  def("V2-4-4", "V 2-4-4", "Columns", vStack([2, 4, 4])),
  def("V4-4-2", "V 4-4-2", "Columns", vStack([4, 4, 2])),
];

const DEF_BY_TYPE = new Map<string, LayoutDef>(
  LAYOUT_DEFS.map((d) => [d.type, d])
);

export function getLayoutDef(type: MultiviewerLayoutType): LayoutDef {
  return DEF_BY_TYPE.get(type) ?? DEF_BY_TYPE.get("2x2")!;
}

export function slotCount(type: MultiviewerLayoutType): number {
  return getLayoutDef(type).cells.length;
}

// Resize a slots array to a layout's slot count, preserving existing
// assignments where they still fit.
export function fitSlots(
  slots: (string | null)[],
  count: number
): (string | null)[] {
  const next = slots.slice(0, count);
  while (next.length < count) next.push(null);
  return next;
}

export const LAYOUT_GROUP_ORDER: LayoutGroup[] = [
  "Basic",
  "Spotlight",
  "Rows",
  "Columns",
];
