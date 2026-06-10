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

      // Studio streams grid (2 columns).
      const columns = 2;
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
      <div className="min-h-[100dvh] bg-black text-white flex items-center justify-center text-2xl">
        Loading…
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
      <div className="min-h-[100dvh] bg-gradient-to-b from-gray-900 via-slate-900 to-black text-white">
        <header className="flex items-center justify-between px-10 py-6 border-b border-white/10">
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-xl text-white/70 hover:text-white focus:outline-none focus:text-white"
          >
            <ChevronLeft size={28} /> {selectedStudio?.name}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-lg text-white/50 hover:text-white focus:outline-none focus:text-white"
          >
            <LogOut size={22} /> Sign out
          </button>
        </header>

        <main className="px-10 py-8">
          <h2 className="text-3xl font-bold mb-6">{selectedStudio?.name} — choose a stream</h2>
          {studioStreams.length === 0 ? (
            <div className="text-white/50 text-xl py-20 text-center">No streams in this studio.</div>
          ) : (
            <div className="grid gap-4 grid-cols-4">
              {studioStreams.map((stream, idx) => (
                <button
                  key={stream.id}
                  ref={(el) => focusRefs.current.set(`s-${idx}`, el)}
                  onClick={() => setPlayer({ streams: studioStreams, index: idx })}
                  onMouseEnter={() => setStreamFocus(idx)}
                  className={`group relative aspect-video rounded-2xl overflow-hidden border-4 text-left transition-all focus:outline-none ${
                    streamFocus === idx
                      ? "border-primary scale-[1.03] shadow-2xl shadow-primary/30"
                      : "border-transparent opacity-80"
                  }`}
                >
                  <StreamThumbnail stream={stream} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none">
                    <div className="text-base font-bold truncate">{stream.name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <p className="mt-10 text-white/40 text-base text-center">
            Use the arrow keys to move · Enter / OK to select · Back to go up
          </p>
        </main>
      </div>
    );
  }

  // Home: Netflix-style rows.
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-gray-900 via-slate-900 to-black text-white">
      <header className="flex items-center justify-between px-10 py-6 border-b border-white/10">
        <img src={tbnLogo} alt="TBN Studios" className="h-12 w-auto" />
        
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-lg text-white/50 hover:text-white focus:outline-none focus:text-white"
        >
          <LogOut size={22} /> Sign out
        </button>
      </header>

      <main className="px-10 py-8 space-y-10">
        {rows.map((row, ri) => (
          <section key={row.key}>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              {row.key === "favorites" && <Heart size={24} className="text-red-500" />}
              {row.key === "multiviewers" && <LayoutGrid size={24} className="text-primary" />}
              {row.key === "studios" && <Tv size={24} />}
              {row.title}
            </h2>

            {row.items.length === 0 ? (
              <div className="text-white/40 text-lg">Nothing here yet.</div>
            ) : (
              <div className="flex gap-5 overflow-x-auto pb-3 -mx-2 px-2">
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
                          className={`relative shrink-0 w-72 aspect-video rounded-2xl overflow-hidden border-4 text-left transition-all focus:outline-none ${
                            active
                              ? "border-primary scale-[1.04] shadow-2xl shadow-primary/30"
                              : "border-transparent opacity-80"
                          }`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
                          <div className="absolute inset-0 p-5 flex flex-col justify-between">
                            <div className="self-start text-xs font-semibold uppercase tracking-wide bg-black/40 px-2 py-1 rounded">
                              {layout.layoutType}
                            </div>
                            <div>
                              <div className="text-2xl font-bold truncate">{layout.name}</div>
                              <div className="text-base text-white/70 flex items-center gap-2">
                                <LayoutGrid size={16} /> {filled} sources
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
                            className={`relative shrink-0 w-72 aspect-video rounded-2xl overflow-hidden border-4 text-left transition-all focus:outline-none ${
                              active
                                ? "border-primary scale-[1.04] shadow-2xl shadow-primary/30"
                                : "border-transparent opacity-80"
                            }`}
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
                            <div className="absolute inset-0 p-5 flex flex-col justify-end">
                              <div className="text-2xl font-bold">{studio.name}</div>
                              <div className="text-base text-white/70 flex items-center gap-2">
                                <Radio size={16} /> {studio.streams?.length ?? 0} streams
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
                            className={`relative shrink-0 w-72 aspect-video rounded-2xl overflow-hidden border-4 text-left transition-all focus:outline-none ${
                              active
                                ? "border-primary scale-[1.04] shadow-2xl shadow-primary/30"
                                : "border-transparent opacity-80"
                            }`}
                          >
                            <StreamThumbnail stream={stream} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                            <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
                              <div className="text-xl font-bold truncate">{stream.name}</div>
                            </div>
                          </button>
                        );
                      })}
              </div>
            )}
          </section>
        ))}

        <p className="pt-2 text-white/40 text-base text-center">
          Use the arrow keys to move · Enter / OK to select · Back to go up
        </p>
      </main>
    </div>
  );
}
