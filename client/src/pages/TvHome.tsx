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
import { Tv, LogOut, ChevronLeft, Radio, Heart, LayoutGrid, Play } from "lucide-react";
import tbnLogo from "@/assets/tbnlogo-white_1756354700943.png";
import tvBackground from "@/assets/auth-background.png";

type Level = "home" | "streams";

// A row on the home screen. Studios always shows; Favorites / Multiviewers only
// appear when the signed-in user actually has some.
type HomeRow =
  | { key: "favorites"; title: string; kind: "streams"; items: Stream[] }
  | { key: "multiviewers"; title: string; kind: "layouts"; items: MultiviewerLayoutWithMeta[] }
  | { key: "studios"; title: string; kind: "studios"; items: StudioWithStreams[] };

// ── Shared 10-foot UI styling ───────────────────────────────────────────────
// One card "language" used everywhere so the grid feels like a single TV app.
// The row is a flex-1 child of its section and vertically centers its cards so
// each focused card's scale-up + ring has slack inside the row instead of being
// clipped flat by overflow-x-auto.
const ROW_SCROLL =
  "flex min-h-0 flex-1 items-center gap-[1.2vw] overflow-x-auto px-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const CARD_BASE =
  "group relative shrink-0 snap-start rounded-2xl overflow-hidden text-left transition-all duration-300 ease-out focus:outline-none will-change-transform";

// Focused cards lift, brighten and gain a bright accent ring + colored glow so
// the selection reads instantly from across the room; the rest sit dimmed and
// slightly desaturated so the focused one clearly "pops" forward.
function cardFocus(active: boolean): string {
  return active
    ? "z-20 scale-[1.1] opacity-100 ring-[3px] ring-primary ring-offset-2 ring-offset-black/40 shadow-[0_24px_70px_-10px_rgba(0,0,0,0.95),0_0_46px_-6px_hsl(var(--primary)/0.7)]"
    : "opacity-50 saturate-[0.7] ring-1 ring-white/10 hover:opacity-90 hover:saturate-100";
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
  // Home navigation, Android-TV "immersive list" style: a row of pill tabs (one
  // per content category) and a content grid of cards for the active tab.
  const [tabIndex, setTabIndex] = useState(0);
  const [colIndex, setColIndex] = useState(0);
  // Which zone the remote is in. When in "tabs", topIndex highlights a top-bar
  // item; the slot AFTER the last tab (index === rows.length) is the Sign out
  // button, so the remote can always reach it.
  const [focusZone, setFocusZone] = useState<"tabs" | "grid">("grid");
  const [topIndex, setTopIndex] = useState(0);
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
    setTabIndex((ti) => Math.min(Math.max(0, rows.length - 1), ti));
    setTopIndex((ti) => Math.min(Math.max(0, rows.length), ti));
  }, [rows.length]);
  useEffect(() => {
    const len = rows[tabIndex]?.items.length ?? 0;
    setColIndex((ci) => Math.min(Math.max(0, len - 1), ci));
  }, [tabIndex, rows]);

  // Keep the focused element (tab, card, or stream) actually focused + in view.
  useEffect(() => {
    if (player) return;
    const key =
      level === "home"
        ? focusZone === "tabs"
          ? `top-${topIndex}`
          : `g-${colIndex}`
        : focusZone === "tabs"
          ? `s-top-${topIndex}`
          : `s-${streamFocus}`;
    const el = focusRefs.current.get(key);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }, [level, focusZone, topIndex, colIndex, streamFocus, player, rows]);

  const openStudio = useCallback(
    (idx: number) => {
      setStudioIndex(idx);
      setLevel("streams");
      setStreamFocus(0);
      setTopIndex(0);
      // Land on the top bar when the studio has no streams, so the remote still
      // has something focused (otherwise the empty grid swallows focus).
      setFocusZone((studios[idx]?.streams?.length ?? 0) > 0 ? "grid" : "tabs");
    },
    [studios],
  );

  const selectHome = useCallback(() => {
    const row = rows[tabIndex];
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
  }, [rows, tabIndex, colIndex, studios, openStudio, setLocation]);

  const goBack = useCallback(() => {
    if (player) {
      setPlayer(null);
      return;
    }
    if (level === "streams") {
      setLevel("home");
      setFocusZone("grid");
    }
  }, [player, level]);

  const handleLogout = useCallback(() => {
    removeAuthToken();
    queryClient.clear();
    setLocation("/tv/login");
  }, [setLocation]);

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
        // Tab bar zone: a horizontal list of pill tabs + a trailing Sign out
        // button (at index === rows.length). Focusing a tab switches content.
        if (focusZone === "tabs") {
          const signOutIdx = rows.length;
          switch (e.key) {
            case "ArrowRight":
              e.preventDefault();
              setTopIndex((t) => {
                const nt = Math.min(signOutIdx, t + 1);
                if (nt < rows.length) {
                  setTabIndex(nt);
                  setColIndex(0);
                }
                return nt;
              });
              break;
            case "ArrowLeft":
              e.preventDefault();
              setTopIndex((t) => {
                const nt = Math.max(0, t - 1);
                if (nt < rows.length) {
                  setTabIndex(nt);
                  setColIndex(0);
                }
                return nt;
              });
              break;
            case "ArrowDown":
              e.preventDefault();
              setFocusZone("grid");
              break;
            case "Enter":
              e.preventDefault();
              if (topIndex >= rows.length) {
                handleLogout();
              } else {
                setTabIndex(topIndex);
                setColIndex(0);
                setFocusZone("grid");
              }
              break;
            default:
              if (isBack) {
                e.preventDefault();
                setFocusZone("grid");
              }
          }
          return;
        }

        // Content grid zone.
        const rowLen = rows[tabIndex]?.items.length ?? 0;
        switch (e.key) {
          case "ArrowUp":
            e.preventDefault();
            setTopIndex(tabIndex);
            setFocusZone("tabs");
            break;
          case "ArrowRight":
            e.preventDefault();
            if (rowLen) setColIndex((c) => Math.min(rowLen - 1, c + 1));
            break;
          case "ArrowLeft":
            e.preventDefault();
            setColIndex((c) => Math.max(0, c - 1));
            break;
          case "Enter":
            e.preventDefault();
            if (rowLen) selectHome();
            break;
          default:
            if (isBack) {
              e.preventDefault();
              setTopIndex(tabIndex);
              setFocusZone("tabs");
            }
        }
        return;
      }

      // Studio drill-down. A top bar (Back / Sign out) sits above the grid; the
      // remote reaches it by pressing Up from the first row of stream cards.
      if (focusZone === "tabs") {
        switch (e.key) {
          case "ArrowRight":
            e.preventDefault();
            setTopIndex((t) => Math.min(1, t + 1));
            break;
          case "ArrowLeft":
            e.preventDefault();
            setTopIndex((t) => Math.max(0, t - 1));
            break;
          case "ArrowDown":
            e.preventDefault();
            setFocusZone("grid");
            break;
          case "Enter":
            e.preventDefault();
            if (topIndex === 0) goBack();
            else handleLogout();
            break;
          default:
            if (isBack) {
              e.preventDefault();
              goBack();
            }
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
          // From the top visual row, Up jumps to the Back / Sign out bar.
          if (streamFocus < columns) {
            setTopIndex(0);
            setFocusZone("tabs");
          } else {
            setStreamFocus((i) => Math.max(0, i - columns));
          }
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
  }, [level, rows, tabIndex, colIndex, topIndex, focusZone, studioStreams, streamFocus, player, selectHome, goBack, handleLogout]);

  // The currently-focused home item drives the hero band + ambient backdrop so
  // the whole screen reflects what you're pointing at (modern OTT behaviour).
  const focusedRow = rows[tabIndex];
  const focusedItem: any = focusedRow?.items[colIndex];
  let heroKind = "";
  let heroTitle = "";
  let heroSub = "";
  let heroHint = "";
  let heroBackdrop: string | null = null;
  if (focusedRow && focusedItem) {
    if (focusedRow.kind === "studios") {
      heroKind = "Studio";
      heroTitle = focusedItem.name;
      heroSub = `${focusedItem.streams?.length ?? 0} streams`;
      heroBackdrop = focusedItem.imageUrl || null;
      heroHint = "Press OK to browse";
    } else if (focusedRow.kind === "layouts") {
      heroKind = "Multiviewer";
      heroTitle = focusedItem.name;
      const filled = (focusedItem.slots ?? []).filter(Boolean).length;
      heroSub = `${filled} sources${
        focusedItem.shared && focusedItem.ownerName ? ` · ${focusedItem.ownerName}` : ""
      }`;
      heroHint = "Press OK to open";
    } else {
      heroKind = focusedRow.key === "favorites" ? "Favorite" : "Live channel";
      heroTitle = focusedItem.name;
      heroSub = "Live now";
      heroHint = "Press OK to watch";
    }
  }

  if (authLoading || (isAuthenticated && studiosLoading)) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden text-white">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${tvBackground})` }}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-6">
          <img src={tbnLogo} alt="TBN Studios" className="h-14 w-auto opacity-90" />
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
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
      <div className="relative min-h-[100dvh] bg-[#06060a] text-white">
        {/* Brand background image sits under everything. */}
        <div
          className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-60"
          style={{ backgroundImage: `url(${tvBackground})` }}
        />
        <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black" />
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
          <header className="flex items-center justify-between px-[4vw] pt-[4vh] pb-2">
            <button
              ref={(el) => focusRefs.current.set("s-top-0", el)}
              onClick={goBack}
              onMouseEnter={() => {
                setTopIndex(0);
                setFocusZone("tabs");
              }}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-lg transition focus:outline-none ${
                focusZone === "tabs" && topIndex === 0
                  ? "scale-105 bg-white text-gray-900 shadow-[0_0_24px_rgba(255,255,255,0.45)]"
                  : "bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              <ChevronLeft size={24} /> Back
            </button>
            <button
              ref={(el) => focusRefs.current.set("s-top-1", el)}
              onClick={handleLogout}
              onMouseEnter={() => {
                setTopIndex(1);
                setFocusZone("tabs");
              }}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-base transition focus:outline-none ${
                focusZone === "tabs" && topIndex === 1
                  ? "scale-105 bg-white text-gray-900 shadow-[0_0_24px_rgba(255,255,255,0.45)]"
                  : "bg-white/5 text-white/45 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              <LogOut size={20} /> Sign out
            </button>
          </header>

          <main className="px-[4vw] pb-[5vh]">
            <div className="mb-[3vh] mt-[2vh] flex items-end gap-4">
              <div
                className="h-12 w-1.5 rounded-full"
                style={{ backgroundColor: selectedStudio?.colorCode || "hsl(var(--primary))" }}
              />
              <div>
                <p className="text-[clamp(0.7rem,1vw,1rem)] font-semibold uppercase tracking-[0.2em] text-white/45">
                  Studio
                </p>
                <h1 className="text-[clamp(1.75rem,4vw,3.25rem)] font-extrabold leading-tight">{selectedStudio?.name}</h1>
              </div>
            </div>

            {studioStreams.length === 0 ? (
              <div className="py-24 text-center text-xl text-white/50">
                No streams in this studio.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-[1.5vw]">
                {studioStreams.map((stream, idx) => (
                  <button
                    key={stream.id}
                    ref={(el) => focusRefs.current.set(`s-${idx}`, el)}
                    onClick={() => setPlayer({ streams: studioStreams, index: idx })}
                    onMouseEnter={() => {
                      setFocusZone("grid");
                      setStreamFocus(idx);
                    }}
                    className={`${CARD_BASE} aspect-video ${cardFocus(focusZone === "grid" && streamFocus === idx)}`}
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
              Use the arrow keys to move · Up for the menu · Enter / OK to select · Back to go up
            </p>
          </main>
        </div>
      </div>
    );
  }

  // Home: Android-TV immersive list — pill tabs, a focus-reactive cinematic
  // backdrop + content block, and a content grid of large 16:9 cards.
  const activeRow = rows[tabIndex];
  const gridItems = activeRow?.items ?? [];
  const signOutFocused = focusZone === "tabs" && topIndex === rows.length;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#06060a] text-white">
      {/* Image background (1) — brand image, always present, dim. */}
      <div
        className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-80"
        style={{ backgroundImage: `url(${tvBackground})` }}
      />
      {/* Poster (2) — the focused item's artwork, scaled + aligned to the top
          right for a cinematic immersive backdrop (per Android TV guidance). */}
      <div
        key={heroBackdrop ?? "none"}
        className="pointer-events-none fixed right-0 top-0 h-[70vh] w-[64vw] animate-in fade-in duration-700"
        style={{
          backgroundImage: heroBackdrop ? `url(${heroBackdrop})` : "none",
          backgroundSize: "cover",
          backgroundPosition: "top right",
          opacity: heroBackdrop ? 0.95 : 0,
        }}
      />
      {/* Cinematic scrims — left→right + bottom→up keep text and cards legible. */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-r from-[#06060a] via-[#06060a]/85 to-transparent" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-t from-[#06060a] via-[#06060a]/45 to-transparent" />

      {/* Top app bar — logo, pill tabs, and Sign out (Android TV pill tabs). */}
      <header className="relative z-20 flex shrink-0 items-center gap-[2vw] px-[4vw] pt-[3vh] pb-[1vh]">
        <img src={tbnLogo} alt="TBN Studios" className="h-[clamp(1.6rem,2.6vw,2.6rem)] w-auto shrink-0" />
        <nav className="flex items-center gap-[0.6vw]">
          {rows.map((row, ti) => {
            const selected = ti === tabIndex;
            const focused = focusZone === "tabs" && topIndex === ti;
            return (
              <button
                key={row.key}
                ref={(el) => focusRefs.current.set(`top-${ti}`, el)}
                onClick={() => {
                  setTabIndex(ti);
                  setColIndex(0);
                  setFocusZone("grid");
                }}
                onMouseEnter={() => {
                  setTopIndex(ti);
                  setTabIndex(ti);
                  setColIndex(0);
                  setFocusZone("tabs");
                }}
                className={`flex items-center gap-2 rounded-full px-[1.4vw] py-[0.9vh] text-[clamp(0.85rem,1.15vw,1.15rem)] font-semibold transition-all duration-200 focus:outline-none ${
                  focused
                    ? "scale-105 bg-white text-gray-900 shadow-[0_0_24px_rgba(255,255,255,0.45)]"
                    : selected
                      ? "bg-white/15 text-white ring-1 ring-white/25"
                      : "text-white/55 hover:text-white"
                }`}
              >
                {row.key === "favorites" && (
                  <Heart size={18} className={focused ? "text-red-600" : "text-red-500"} />
                )}
                {row.key === "multiviewers" && <LayoutGrid size={18} />}
                {row.key === "studios" && <Tv size={18} />}
                {row.title}
              </button>
            );
          })}
        </nav>
        <button
          ref={(el) => focusRefs.current.set(`top-${rows.length}`, el)}
          onClick={handleLogout}
          onMouseEnter={() => {
            setTopIndex(rows.length);
            setFocusZone("tabs");
          }}
          className={`ml-auto flex shrink-0 items-center gap-2 rounded-full px-[1.2vw] py-[0.9vh] text-[clamp(0.8rem,1.05vw,1.05rem)] transition focus:outline-none ${
            signOutFocused
              ? "scale-105 bg-white text-gray-900 shadow-[0_0_24px_rgba(255,255,255,0.45)]"
              : "bg-white/5 text-white/65 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
          }`}
        >
          <LogOut size={18} /> Sign out
        </button>
      </header>

      {/* Content block (3) — overline, title, meta and action; reflects focus. */}
      <section className="relative z-10 flex min-h-[28vh] shrink-0 flex-col justify-center px-[4vw] pt-[1vh] pb-[1vh]">
        {heroTitle ? (
          <div key={heroTitle} className="max-w-[48vw] animate-in fade-in slide-in-from-bottom-3 duration-500">
            <p className="mb-[1vh] text-[clamp(0.7rem,0.95vw,1rem)] font-semibold uppercase tracking-[0.35em] text-primary">
              {heroKind}
            </p>
            <h1 className="text-[clamp(2rem,5vw,4.5rem)] font-extrabold leading-[1.02] drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
              {heroTitle}
            </h1>
            <p className="mt-[1.2vh] text-[clamp(0.9rem,1.3vw,1.3rem)] text-white/75">{heroSub}</p>
            <div className="mt-[2.4vh] inline-flex items-center gap-2 text-[clamp(0.8rem,1vw,1.05rem)] font-medium text-white/55">
              <Play size={16} className="fill-current" /> {heroHint}
            </div>
          </div>
        ) : (
          <h1 className="text-[clamp(1.75rem,4vw,3rem)] font-extrabold text-white/90">Welcome to TBN Studios</h1>
        )}
      </section>

      <div className="flex-1" />

      {/* Content grid (4) — the active tab's cards as a focusable row. */}
      <section className="relative z-10 flex h-[34vh] shrink-0 flex-col px-[4vw] pb-[0.5vh]">
        <h2 className="mb-[1vh] flex shrink-0 items-center gap-2.5 text-[clamp(0.95rem,1.3vw,1.3rem)] font-bold tracking-tight text-white/90">
          {activeRow?.key === "favorites" && <Heart size={20} className="text-red-500" />}
          {activeRow?.key === "multiviewers" && <LayoutGrid size={20} className="text-primary" />}
          {activeRow?.key === "studios" && <Tv size={20} className="text-white/80" />}
          {activeRow?.title}
        </h2>

        {gridItems.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center text-lg text-white/40">Nothing here yet.</div>
        ) : (
          <div className={ROW_SCROLL}>
            {activeRow?.kind === "layouts"
              ? (gridItems as MultiviewerLayoutWithMeta[]).map((layout, ci) => {
                  const active = focusZone === "grid" && ci === colIndex;
                  const filled = (layout.slots ?? []).filter(Boolean).length;
                  return (
                    <button
                      key={layout.id}
                      ref={(el) => focusRefs.current.set(`g-${ci}`, el)}
                      onClick={() => setLocation(`/multiviewer/view/${layout.id}`)}
                      onMouseEnter={() => {
                        setFocusZone("grid");
                        setColIndex(ci);
                      }}
                      className={`${CARD_BASE} h-[80%] aspect-video ${cardFocus(active)}`}
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
              : activeRow?.kind === "studios"
                ? (gridItems as StudioWithStreams[]).map((studio, ci) => {
                    const active = focusZone === "grid" && ci === colIndex;
                    return (
                      <button
                        key={studio.id}
                        ref={(el) => focusRefs.current.set(`g-${ci}`, el)}
                        onClick={() => {
                          const pos = studios.findIndex((s) => s.id === studio.id);
                          openStudio(pos === -1 ? ci : pos);
                        }}
                        onMouseEnter={() => {
                          setFocusZone("grid");
                          setColIndex(ci);
                        }}
                        className={`${CARD_BASE} h-[80%] aspect-video ${cardFocus(active)}`}
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
                : (gridItems as Stream[]).map((stream, ci) => {
                    const active = focusZone === "grid" && ci === colIndex;
                    return (
                      <button
                        key={stream.id}
                        ref={(el) => focusRefs.current.set(`g-${ci}`, el)}
                        onClick={() => setPlayer({ streams: gridItems as Stream[], index: ci })}
                        onMouseEnter={() => {
                          setFocusZone("grid");
                          setColIndex(ci);
                        }}
                        className={`${CARD_BASE} h-[80%] aspect-video ${cardFocus(active)}`}
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

      <p className="relative z-10 shrink-0 pb-[1.5vh] text-center text-[clamp(0.6rem,0.85vw,0.8rem)] text-white/35">
        Use the arrow keys to move · Enter / OK to select
      </p>
    </div>
  );
}
