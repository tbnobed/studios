import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LayoutMiniature } from "@/components/MultiviewerGrid";
import {
  LAYOUT_DEFS,
  LAYOUT_GROUP_ORDER,
  getLayoutDef,
} from "@/lib/multiviewerLayouts";
import type { MultiviewerLayoutType } from "@shared/schema";

export function LayoutPicker({
  value,
  onChange,
}: {
  value: MultiviewerLayoutType;
  onChange: (type: MultiviewerLayoutType) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = getLayoutDef(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="touch-area gap-2"
          data-testid="button-layout-picker"
          title="Choose layout"
        >
          <span className="text-current opacity-80">
            <LayoutMiniature type={value} className="h-4 w-6" />
          </span>
          <span className="hidden sm:inline">{current.label}</span>
          <ChevronDown size={14} className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <ScrollArea className="h-[60vh] max-h-[460px]">
          <div className="p-3 space-y-4">
            {LAYOUT_GROUP_ORDER.map((group) => {
              const defs = LAYOUT_DEFS.filter((d) => d.group === group);
              if (defs.length === 0) return null;
              return (
                <div key={group}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {defs.map((d) => {
                      const selected = d.type === value;
                      return (
                        <button
                          key={d.type}
                          type="button"
                          onClick={() => {
                            onChange(d.type);
                            setOpen(false);
                          }}
                          className={`group relative flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors ${
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50 hover:bg-muted"
                          }`}
                          data-testid={`button-layout-${d.type}`}
                          title={d.label}
                        >
                          {selected && (
                            <Check
                              size={12}
                              className="absolute right-1 top-1 text-primary"
                            />
                          )}
                          <div className="flex h-9 w-full items-center justify-center">
                            <span
                              className={
                                selected
                                  ? "text-primary"
                                  : "text-muted-foreground group-hover:text-foreground"
                              }
                            >
                              <LayoutMiniature
                                type={d.type}
                                className="h-8 w-[3.5rem]"
                              />
                            </span>
                          </div>
                          <span className="w-full truncate text-center text-[10px] font-medium text-foreground">
                            {d.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
