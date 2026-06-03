import type { ReactNode } from "react";
import { getLayoutDef } from "@/lib/multiviewerLayouts";
import type { MultiviewerLayoutType } from "@shared/schema";

// Renders any multiviewer layout from its registry definition as a CSS grid.
// `renderCell(index, big)` produces the tile for slot `index`; `big` is true
// for tiles that span more than one base cell (so they can be styled larger).
export function MultiviewerGrid({
  type,
  renderCell,
}: {
  type: MultiviewerLayoutType;
  renderCell: (index: number, big: boolean) => ReactNode;
}) {
  const def = getLayoutDef(type);
  return (
    <div
      className="h-full grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${def.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${def.rows}, minmax(0, 1fr))`,
      }}
    >
      {def.cells.map((c, i) => (
        <div
          key={i}
          className="min-h-0 min-w-0 h-full w-full"
          style={{
            gridColumn: `${c.c} / span ${c.cs}`,
            gridRow: `${c.r} / span ${c.rs}`,
          }}
        >
          {renderCell(i, c.cs * c.rs > 1)}
        </div>
      ))}
    </div>
  );
}

// A small static preview of a layout's tile arrangement, used in the picker.
export function LayoutMiniature({
  type,
  className = "",
}: {
  type: MultiviewerLayoutType;
  className?: string;
}) {
  const def = getLayoutDef(type);
  return (
    <div
      className={`grid gap-px bg-transparent ${className}`}
      style={{
        gridTemplateColumns: `repeat(${def.cols}, 1fr)`,
        gridTemplateRows: `repeat(${def.rows}, 1fr)`,
      }}
    >
      {def.cells.map((c, i) => (
        <div
          key={i}
          className="rounded-[1px] bg-current"
          style={{
            gridColumn: `${c.c} / span ${c.cs}`,
            gridRow: `${c.r} / span ${c.rs}`,
          }}
        />
      ))}
    </div>
  );
}
