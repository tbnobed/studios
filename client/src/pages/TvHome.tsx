import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { StreamThumbnail } from "@/components/StreamThumbnail";
import { StreamSingleView } from "@/components/StreamSingleView";
import { useAuth } from "@/hooks/useAuth";
import { removeAuthToken } from "@/lib/authUtils";
import { queryClient } from "@/lib/queryClient";
import type {
  StudioWithStreams,
  Stream,
  FavoriteWithStream,
  MultiviewerLayoutWithMeta,
} from "@shared/schema";
import { Tv, LogOut, ChevronLeft, Radio, Heart, LayoutGrid } from "lucide-react";
import tbnLogo from "@/assets/tbnlogo-white_1756354700943.png";

type Level = "home" | "streams";

// A row on the home screen. Studios always shows; Favorites / Multiviewers only
// appear when the signed-in user actually has some.
type HomeRow =
  | { key: "favorites"; title: string; kind: "streams"; items: Stream[] }
  | { key: "multiviewers"; title: string; kind: "layouts"; items: MultiviewerLayoutWithMeta[] }
  | { key: "studios"; title: string; kind: "studios"; items: StudioWithStreams[] };

// ── Shared 10-foot UI styling ───────────────────────────────────────────────
// One card "language" used everywhere so the grid feels like a single TV app.
const ROW_SCROLL =
  "flex gap-5 overflow-x-auto pb-6 pt-2 -mx-2 px-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const CARD_BASE =
  "group relative shrink-0 snap-start rounded-2xl overflow-hidden text-left transition-all duration-300 ease-out focus:outline-none will-change-transform";

// Focused cards lift, brighten and gain a soft ring + glow (Apple TV style);
// the rest sit slightly dimmed so the focused one clearly reads as "selected".
function cardFocus(active: boolean): string {
  return active
    ? "z-10 scale-[1.08] ring-4 ring-white shadow-[0_28px_80px_-12px_rgba(0,0,0,0.9)]"
    : "ring-1 ring-white/10 opacity-70 hover:opacity-100";
}

// A studio's artwork: its uploaded image (from Studio Management) or, failing
// that, a tasteful gradient built from its brand color.
function StudioArt({ studio }: { studio: StudioWithStreams }) {
  if (studio.imageUrl) {
    return (
      <img
        src={studio.imageUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    );
  }
  const c = studio.colorCode || "#334155";
  return (
    <div
      className="absolute inset-0"
      style={{ backgroundImage: `linear-gradient(135deg, ${c} 0%, #0b0b12 100%)` }}
    />
  );
}

// 10-foot "living room" UI for OTT devices, driven entirely by a remote:
//   - Home: Netflix-style rows of Favorites, My Multiviewers, and Studios.
//     Left/Right moves within a row, Up/Down moves between rows, Enter selects.
//   - Selecting a favorite (or a studio's stream) opens a fullscreen player.
//   - Selecting a multiviewer opens its fullscreen wall.
//   - Selecting a studio drills into that studio's streams grid.
// The fullscreen player reuses StreamSingleView so it stays in parity with the
// Dashboard/Favorites viewing experience (audio on, arrow keys switch streams).
export default function TvHome() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [level, setLevel] = useState<Level>("home");
  // Home navigation (2D across rows / cards).
  const [rowIndex, setRowIndex] = useState(0);
  const [colIndex, setColIndex] = useState(0);
  // Studio drill-down.
  const [studioIndex, setStudioIndex] = useState(0);
  const [streamFocus, setStreamFocus] = useState(0);
  // Fullscreen player carries its own stream list so next/prev cycles correctly
  // whether it was opened from Favorites or from a studio's streams.
  const [player, setPlayer] = useState<{ streams: Stream[]; index: number } | null>(null);

  const focusRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/tv/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: studios = [], isLoading: studiosLoading } = useQuery<StudioWithStreams[]>({
    queryKey: ["/api/studios"],
    enabled: isAuthenticated,
  });
  const { data: favoritesData = [] } = useQuery<FavoriteWithStream[]>({
    queryKey: ["/api/favorites"],
    enabled: isAuthenticated,
  });
  const { data: layouts = [] } = useQuery<MultiviewerLayoutWithMeta[]>({
    queryKey: ["/api/multiviewer-layouts"],
    enabled: isAuthenticated,
  });

  const favoriteStreams = useMemo(
    () => favoritesData.map((f) => f.stream).filter(Boolean),
    [favoritesData],
  );

  // Build the visible home rows. Studios always shows last; the curated rows
  // (Favorites, Multiviewers) only appear when there's something in them.
  const rows = useMemo<HomeRow[]>(() => {
    const r: HomeRow[] = [];
    if (favoriteStreams.length) {
      r.push({ key: "favorites", title: "Favorites", kind: "streams", items: favoriteStreams });
    }
    if (layouts.length) {
      r.push({ key: "multiviewers", title: "My Multiviewers", kind: "layouts", items: layouts });
    }
    r.push({ key: "studios", title: "Studios", kind: "studios", items: studios });
    return r;
  }, [favoriteStreams, layouts, studios]);

  const selectedStudio = studios[studioIndex];
  const studioStreams: Stream[] = selectedStudio?.streams ?? [];

  // Clamp home focus whenever the rows change (data loads in, etc).
  useEffect(() => {
    setRowIndex((ri) => Math.min(Math.max(0, rows.length - 1), ri));
  }, [rows.length]);
  useEffect(() => {
    const len = rows[rowIndex]?.items.length ?? 0;
    setColIndex((ci) => Math.min(Math.max(0, len - 1), ci));
  }, [rowIndex, rows]);

  // Keep the focused card actually focused + scrolled into view.
  useEffect(() => {
    if (player) return;
    const key = level === "home" ? `h-${rowIndex}-${colIndex}` : `s-${streamFocus}`;
    const el = focusRefs.current.get(key);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }, [level, rowIndex, colIndex, streamFocus, player, rows]);

  const openStudio = useCallback((idx: number) => {
    setStudioIndex(idx);
    setLevel("streams");
    setStreamFocus(0);
  }, []);

  const selectHome = useCallback(() => {
    const row = rows[rowIndex];
    if (!row) return;
    if (row.kind === "streams") {
      if (row.items[colIndex]) setPlayer({ streams: row.items, index: colIndex });
    } else if (row.kind === "layouts") {
      const layout = row.items[colIndex];
      if (layout) setLocation(`/multiviewer/view/${layout.id}`);
    } else {
      if (row.items[colIndex]) {
        const studioPos = studios.findIndex((s) => s.id === row.items[colIndex].id);
        openStudio(studioPos === -1 ? colIndex : studioPos);
      }
    }
  }, [rows, rowIndex, colIndex, studios, openStudio, setLocation]);

  const goBack = useCallback(() => {
    if (player) {
      setPlayer(null);
      return;
    }
    if (level === "streams") {
      setLevel("home");
    }
  }, [player, level]);

  // Remote / keyboard navigation. The fullscreen player owns its own arrow keys
  // (via StreamSingleView), so we only handle Back while it's open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (player) {
        if (e.key === "Backspace" || e.key === "GoBack" || e.key === "BrowserBack") {
          e.preventDefault();
          goBack();
        }
        return;
      }

      const isBack =
        e.key === "Backspace" ||
        e.key === "Escape" ||
        e.key === "GoBack" ||
        e.key === "BrowserBack";

      if (level === "home") {
        const rowLen = rows[rowIndex]?.items.length ?? 0;
        if (rowLen === 0 && e.key !== "Enter") {
          // Empty row: nothing to move to or select; let the browser be.
          return;
        }
        switch (e.key) {
          case "ArrowRight":
            e.preventDefault();
            setColIndex((c) => Math.max(0, Math.min(rowLen - 1, c + 1)));
            break;
          case "ArrowLeft":
            e.preventDefault();
            setColIndex((c) => Math.max(0, c - 1));
            break;
          case "ArrowDown":
            e.preventDefault();
            setRowIndex((r) => {
              const nr = Math.min(rows.length - 1, r + 1);
              const nlen = rows[nr]?.items.length ?? 0;
              setColIndex((c) => Math.min(c, Math.max(0, nlen - 1)));
              return nr;
            });
            break;
          case "ArrowUp":
            e.preventDefault();
            setRowIndex((r) => {
              const nr = Math.max(0, r - 1);
              const nlen = rows[nr]?.items.length ?? 0;
              setColIndex((c) => Math.min(c, Math.max(0, nlen - 1)));
              return nr;
            });
            break;
          case "Enter":
            e.preventDefault();
            selectHome();
            break;
        }
        return;
      }

      // Studio streams grid — must match the rendered grid-cols-4 layout so
      // Up/Down moves a full visual row at a time.
      const columns = 4;
      const last = Math.max(0, studioStreams.length - 1);
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setStreamFocus((i) => Math.max(0, Math.min(last, i + 1)));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setStreamFocus((i) => Math.max(0, i - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setStreamFocus((i) => Math.max(0, Math.min(last, i + columns)));
          break;
        case "ArrowUp":
          e.preventDefault();
          setStreamFocus((i) => Math.max(0, i - columns));
          break;
        case "Enter":
          e.preventDefault();
          if (studioStreams[streamFocus]) {
            setPlayer({ streams: studioStreams, index: streamFocus });
          }
          break;
        default:
          if (isBack) {
            e.preventDefault();
            goBack();
          }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [level, rows, rowIndex, studioStreams, streamFocus, player, selectHome, goBack]);

  const handleLogout = () => {
    removeAuthToken();
    queryClient.clear();
    setLocation("/tv/login");
  };

  if (authLoading || (isAuthenticated && studiosLoading)) {
    return (
      <div className="min-h-[100dvh] bg-[#08080c] text-white flex flex-col items-center justify-center gap-6">
        <img src={tbnLogo} alt="TBN Studios" className="h-14 w-auto opacity-90" />
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
    );
  }

  // Fullscreen player level.
  if (player && player.streams[player.index]) {
    const list = player.streams;
    return (
      <StreamSingleView
        streams={list}
        currentIndex={player.index}
        onNext={() => setPlayer((p) => (p ? { ...p, index: (p.index + 1) % list.length } : p))}
        onPrevious={() =>
          setPlayer((p) => (p ? { ...p, index: (p.index - 1 + list.length) % list.length } : p))
        }
        onExit={() => setPlayer(null)}
      />
    );
  }

  // Studio streams drill-down.
  if (level === "streams") {
    return (
      <div className="relative min-h-[100dvh] bg-[#08080c] text-white">
        {/* Ambient backdrop drawn from the studio's own artwork. */}
        {selectedStudio?.imageUrl && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <img
              src={selectedStudio.imageUrl}
              alt=""
              className="h-full w-full scale-110 object-cover opacity-20 blur-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#08080c]/60 via-[#08080c]/90 to-[#08080c]" />
          </div>
        )}

        <div className="relative">
          <header className="flex items-center justify-between px-12 py-6">
            <button
              onClick={goBack}
              className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-lg text-white/80 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
            >
              <ChevronLeft size={24} /> Back
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-base text-white/45 transition hover:text-white focus:text-white focus:outline-none"
            >
              <LogOut size={20} /> Sign out
            </button>
          </header>

          <main className="px-12 pb-12">
            <div className="mb-8 flex items-end gap-4">
              <div
                className="h-12 w-1.5 rounded-full"
                style={{ backgroundColor: selectedStudio?.colorCode || "hsl(var(--primary))" }}
              />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/45">
                  Studio
                </p>
                <h1 className="text-4xl font-extrabold leading-tight">{selectedStudio?.name}</h1>
              </div>
            </div>

            {studioStreams.length === 0 ? (
              <div className="py-24 text-center text-xl text-white/50">
                No streams in this studio.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-6">
                {studioStreams.map((stream, idx) => (
                  <button
                    key={stream.id}
                    ref={(el) => focusRefs.current.set(`s-${idx}`, el)}
                    onClick={() => setPlayer({ streams: studioStreams, index: idx })}
                    onMouseEnter={() => setStreamFocus(idx)}
                    className={`${CARD_BASE} aspect-video ${cardFocus(streamFocus === idx)}`}
                  >
                    <StreamThumbnail stream={stream} />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide shadow">
                      <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                      <div className="truncate text-base font-bold">{stream.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p className="mt-12 text-center text-sm text-white/35">
              Use the arrow keys to move · Enter / OK to select · Back to go up
            </p>
          </main>
        </div>
      </div>
    );
  }

  // Home: Netflix-style rows.
  return (
    <div className="min-h-[100dvh] bg-[#08080c] text-white">
      {/* Subtle top spotlight so the header reads as a distinct band. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/10 via-white/[0.02] to-transparent" />

      <header className="relative flex items-center justify-between px-12 py-7">
        <img src={tbnLogo} alt="TBN Studios" className="h-12 w-auto" />
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-base text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
        >
          <LogOut size={20} /> Sign out
        </button>
      </header>

      <main className="relative px-12 pb-16 space-y-12">
        {rows.map((row, ri) => (
          <section key={row.key}>
            <h2 className="mb-1 flex items-center gap-2.5 text-xl font-bold tracking-tight">
              {row.key === "favorites" && <Heart size={22} className="text-red-500" />}
              {row.key === "multiviewers" && <LayoutGrid size={22} className="text-primary" />}
              {row.key === "studios" && <Tv size={22} className="text-white/80" />}
              {row.title}
            </h2>

            {row.items.length === 0 ? (
              <div className="py-6 text-lg text-white/40">Nothing here yet.</div>
            ) : (
              <div className={ROW_SCROLL}>
                {row.kind === "layouts"
                  ? (row.items as MultiviewerLayoutWithMeta[]).map((layout, ci) => {
                      const active = ri === rowIndex && ci === colIndex;
                      const filled = (layout.slots ?? []).filter(Boolean).length;
                      return (
                        <button
                          key={layout.id}
                          ref={(el) => focusRefs.current.set(`h-${ri}-${ci}`, el)}
                          onClick={() => setLocation(`/multiviewer/view/${layout.id}`)}
                          onMouseEnter={() => {
                            setRowIndex(ri);
                            setColIndex(ci);
                          }}
                          className={`${CARD_BASE} w-[19rem] aspect-video ${cardFocus(active)}`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-slate-900 to-black" />
                          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:28px_28px]" />
                          <div className="absolute inset-0 flex flex-col justify-between p-5">
                            <div className="self-start rounded-md bg-black/50 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide ring-1 ring-white/10">
                              {layout.layoutType}
                            </div>
                            <div>
                              <div className="truncate text-2xl font-bold">{layout.name}</div>
                              <div className="flex items-center gap-2 text-sm text-white/70">
                                <LayoutGrid size={15} /> {filled} sources
                                {layout.shared && layout.ownerName ? ` · ${layout.ownerName}` : ""}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  : row.kind === "studios"
                    ? (row.items as StudioWithStreams[]).map((studio, ci) => {
                        const active = ri === rowIndex && ci === colIndex;
                        return (
                          <button
                            key={studio.id}
                            ref={(el) => focusRefs.current.set(`h-${ri}-${ci}`, el)}
                            onClick={() => {
                              const pos = studios.findIndex((s) => s.id === studio.id);
                              openStudio(pos === -1 ? ci : pos);
                            }}
                            onMouseEnter={() => {
                              setRowIndex(ri);
                              setColIndex(ci);
                            }}
                            className={`${CARD_BASE} w-[19rem] aspect-video ${cardFocus(active)}`}
                          >
                            <StudioArt studio={studio} />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5">
                              <div className="truncate text-2xl font-bold drop-shadow">{studio.name}</div>
                              <div className="flex items-center gap-2 text-sm text-white/75">
                                <Radio size={15} /> {studio.streams?.length ?? 0} streams
                              </div>
                            </div>
                          </button>
                        );
                      })
                    : (row.items as Stream[]).map((stream, ci) => {
                        const active = ri === rowIndex && ci === colIndex;
                        return (
                          <button
                            key={stream.id}
                            ref={(el) => focusRefs.current.set(`h-${ri}-${ci}`, el)}
                            onClick={() => setPlayer({ streams: row.items as Stream[], index: ci })}
                            onMouseEnter={() => {
                              setRowIndex(ri);
                              setColIndex(ci);
                            }}
                            className={`${CARD_BASE} w-[19rem] aspect-video ${cardFocus(active)}`}
                          >
                            <StreamThumbnail stream={stream} />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide shadow">
                              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live
                            </div>
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
                              <div className="truncate text-xl font-bold">{stream.name}</div>
                            </div>
                          </button>
                        );
                      })}
              </div>
            )}
          </section>
        ))}

        <p className="pt-2 text-center text-sm text-white/35">
          Use the arrow keys to move · Enter / OK to select · Back to go up
        </p>
      </main>
    </div>
  );
}
