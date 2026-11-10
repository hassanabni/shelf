"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  MoonStar,
  NotebookPen,
  Plus,
  Trash2,
  X,
  Settings2,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { getBook, getBookFile, refreshBook, updateBook, uid, type BookMeta, type Note } from "@/lib/db";
import { openPdf, timeAgo } from "@/lib/pdf";
import { cn } from "@/lib/utils";

function useIsDesktop() {
  const [d, setD] = useState(true);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    const f = () => setD(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return d;
}

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

export default function Reader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isDesktop = useIsDesktop();
  const [book, setBook] = useState<BookMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [panel, setPanel] = useState<null | "bookmarks" | "notes">(null);
  const [chrome, setChrome] = useState(true);
  const [nightPages, setNightPages] = useState(false);
  const [jump, setJump] = useState<string | null>(null);
  const [dl, setDl] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [stageW, setStageW] = useState(0);
  const [stageH, setStageH] = useState(0);

  // Load book + file
  useEffect(() => {
    let alive = true;
    let d: PDFDocumentProxy | null = null;
    (async () => {
      // Prefer the cloud copy so we resume where you stopped on any device.
      const meta = (await refreshBook(id)) ?? (await getBook(id));
      if (!meta) return alive && setMissing(true);
      if (!alive) return;
      setBook(meta);
      setPage(Math.min(Math.max(1, meta.lastPage || 1), meta.pages || 1));
      const file = await getBookFile(id, (p) => alive && setDl(p));
      if (!file) return alive && setMissing(true);
      const next = await updateBook(id, { lastOpenedAt: Date.now() });
      if (!alive) return;
      if (next) setBook(next);
      d = await openPdf(await file.arrayBuffer());
      if (alive) setDoc(d);
    })().catch((e) => {
      console.error(e);
      if (alive) setMissing(true);
    });
    setNightPages(ls.get("shelf:night") === "1");
    return () => {
      alive = false;
      d?.destroy();
    };
  }, [id]);

  // Stage size
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setStageW(e.contentRect.width);
      setStageH(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [book]);

  // Render current page
  useEffect(() => {
    if (!doc || !stageW || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      const p = await doc.getPage(page);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const pad = isDesktop ? 48 : 16;
      const maxW = Math.min(stageW - pad, 920);
      const fitW = maxW / base.width;
      // Desktop: whole page visible (fit page). Mobile: fit width for readability.
      const fitH = isDesktop ? (stageH - 48) / base.height : Infinity;
      const scale = Math.max(0.2, Math.min(fitW, fitH)) * zoom;
      const vp = p.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const canvas = canvasRef.current!;
      const off = document.createElement("canvas");
      off.width = Math.floor(vp.width * dpr);
      off.height = Math.floor(vp.height * dpr);
      const ctx = off.getContext("2d")!;
      taskRef.current?.cancel();
      const task = p.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      taskRef.current = task;
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.style.width = `${Math.floor(vp.width)}px`;
      canvas.style.height = `${Math.floor(vp.height)}px`;
      canvas.getContext("2d")!.drawImage(off, 0, 0);
      setRendering(false);
      stageRef.current?.scrollTo({ top: 0 });
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, page, stageW, stageH, zoom, isDesktop]);

  // Persist position (debounced)
  useEffect(() => {
    if (!book) return;
    if (book.lastPage === page) return;
    const t = setTimeout(() => {
      updateBook(id, { lastPage: page, lastOpenedAt: Date.now() }).then((nb) => nb && setBook(nb));
    }, 600);
    return () => clearTimeout(t);
  }, [page, id, book]);

  const total = book?.pages ?? 1;
  const go = useCallback((n: number) => setPage(() => Math.min(Math.max(1, n), total)), [total]);
  const next = useCallback(() => setPage((p) => Math.min(p + 1, total)), [total]);
  const prev = useCallback(() => setPage((p) => Math.max(p - 1, 1)), []);

  const isBookmarked = !!book?.bookmarks.some((b) => b.page === page);

  const pageSnippet = async (n: number) => {
    try {
      const p = await doc!.getPage(n);
      const tc = await p.getTextContent();
      const text = tc.items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return text.slice(0, 90) || `Page ${n}`;
    } catch {
      return `Page ${n}`;
    }
  };

  const toggleBookmark = useCallback(async () => {
    if (!book) return;
    if (isBookmarked) {
      const nb = await updateBook(id, (b) => ({ bookmarks: b.bookmarks.filter((x) => x.page !== page) }));
      if (nb) setBook(nb);
      toast("Bookmark removed", { description: `Page ${page}` });
    } else {
      const label = doc ? await pageSnippet(page) : `Page ${page}`;
      const nb = await updateBook(id, (b) => ({
        lastPage: page,
        bookmarks: [...b.bookmarks, { page, label, createdAt: Date.now() }].sort((a, c) => a.page - c.page),
      }));
      if (nb) setBook(nb);
      toast.success(`Page ${page} saved`, { description: "Find it anytime under Bookmarks." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, isBookmarked, id, page, doc]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
        e.preventDefault();
        prev();
      } else if (e.key.toLowerCase() === "b") toggleBookmark();
      else if (e.key.toLowerCase() === "n") setPanel("notes");
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
      else if (e.key === "-") setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, toggleBookmark]);

  // Touch swipe
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return (touch.current = null);
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s || zoom > 1) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - s.t < 700) {
      if (dx < 0) next();
      else prev();
    }
  };
  const onStageClick = (e: React.MouseEvent) => {
    if (isDesktop) return;
    const w = window.innerWidth;
    const x = e.clientX;
    if (x < w * 0.25) prev();
    else if (x > w * 0.75) next();
    else setChrome((c) => !c);
  };

  const progress = useMemo(() => Math.round((page / total) * 100), [page, total]);

  if (missing)
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="font-heading text-2xl font-semibold">We couldn’t open this book</p>
          <p className="mt-2 text-sm text-muted-foreground">It may have been removed, or you’re offline and it hasn’t been downloaded to this device yet.</p>
          <Button asChild className="mt-6 rounded-full">
            <Link href="/">Back to library</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <div
      className={cn(
        "flex h-dvh flex-col overflow-hidden bg-muted/40 transition-[padding] duration-300 dark:bg-background",
        nightPages && "dim-pages",
        panel && isDesktop && "pr-[24rem]",
      )}
    >
      {/* Top bar */}
      <header
        className={cn(
          "z-20 shrink-0 border-b border-border/60 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl transition-[margin,opacity] duration-300",
          !chrome && "pointer-events-none -mt-[calc(3.5rem+env(safe-area-inset-top))] opacity-0",
        )}
      >
        <div className="flex h-14 items-center gap-1 px-2 sm:gap-2 sm:px-4">
          <Button asChild variant="ghost" size="icon-lg" className="rounded-full" aria-label="Back to library">
            <Link href="/">
              <ArrowLeft className="size-[18px]" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate font-heading text-[15px] leading-tight font-semibold sm:text-base">{book?.title ?? "Loading…"}</p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              Page {page} of {total} · {progress}%
            </p>
          </div>

          <div className="hidden items-center gap-0.5 rounded-full border bg-card p-0.5 md:flex">
            <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">
              <Minus />
            </Button>
            <button onClick={() => setZoom(1)} className="w-12 text-center text-xs font-medium tabular-nums text-muted-foreground hover:text-foreground">
              {Math.round(zoom * 100)}%
            </button>
            <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">
              <Plus />
            </Button>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-lg" className="relative rounded-full" onClick={() => setPanel("notes")} aria-label="Notes">
                <NotebookPen className="size-[18px]" />
                {!!book?.notes.length && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notes (N)</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Reading settings">
                <Settings2 className="size-[18px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Reading</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={nightPages}
                onCheckedChange={(v) => {
                  setNightPages(!!v);
                  ls.set("shelf:night", v ? "1" : "0");
                }}
              >
                <MoonStar /> Night pages
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem onClick={() => setPanel("bookmarks")}>
                <Bookmark /> All bookmarks
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="md:hidden">Zoom · {Math.round(zoom * 100)}%</DropdownMenuLabel>
              <div className="flex gap-1 px-1 pb-1 md:hidden">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
                  <Minus />
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setZoom(1)}>
                  <Maximize2 />
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>
                  <Plus />
                </Button>
              </div>
              <DropdownMenuItem className="hidden md:flex" onClick={() => document.documentElement.requestFullscreen?.()}>
                <Maximize2 /> Full screen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <Button
            onClick={toggleBookmark}
            disabled={!book}
            className={cn("ml-1 h-9 rounded-full px-3 sm:px-4", isBookmarked && "bg-primary/15 text-primary hover:bg-primary/20")}
            variant={isBookmarked ? "secondary" : "default"}
          >
            {isBookmarked ? <BookmarkCheck /> : <Bookmark />}
            <span className="hidden sm:inline">{isBookmarked ? "Saved" : "Save page"}</span>
          </Button>
        </div>
      </header>

      {/* Page stage */}
      <div
        ref={stageRef}
        className="relative flex-1 overflow-auto overscroll-contain"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onStageClick}
      >
        <div className="flex min-h-full min-w-fit items-start justify-center px-2 py-2 md:items-center md:px-6 md:py-6">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className={cn(
                "pdf-canvas block rounded-sm bg-white shadow-[0_1px_3px_rgba(0,0,0,.08),0_12px_40px_-12px_rgba(0,0,0,.25)] transition-opacity duration-150 dark:shadow-[0_0_0_1px_rgba(255,255,255,.06),0_20px_50px_-12px_rgba(0,0,0,.7)]",
                rendering && doc ? "opacity-60" : "opacity-100",
              )}
            />
            {isBookmarked && (
              <div className="absolute -top-1 right-6 drop-shadow-md">
                <svg width="22" height="34" viewBox="0 0 22 34" className="fill-primary">
                  <path d="M0 0h22v34l-11-8-11 8z" />
                </svg>
              </div>
            )}
          </div>
        </div>
        {!doc && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              {dl !== null && dl < 100 ? `Downloading your book… ${dl}%` : "Opening your book…"}
            </div>
          </div>
        )}

        {/* Desktop side arrows */}
        <button
          onClick={prev}
          disabled={page <= 1}
          aria-label="Previous page"
          className="fixed top-1/2 left-4 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border bg-background/80 shadow-sm backdrop-blur transition hover:bg-background disabled:opacity-0 lg:grid"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          onClick={next}
          disabled={page >= total}
          aria-label="Next page"
          className={cn(
            "fixed top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border bg-background/80 shadow-sm backdrop-blur transition hover:bg-background disabled:opacity-0 lg:grid",
            panel && isDesktop ? "right-[25rem]" : "right-4",
          )}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Bottom bar */}
      <footer
        className={cn(
          "z-20 shrink-0 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl transition-[margin,opacity] duration-300",
          !chrome && "pointer-events-none -mb-[calc(3.75rem+env(safe-area-inset-bottom))] opacity-0",
        )}
      >
        <div className="mx-auto flex h-15 max-w-3xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <Button variant="ghost" size="icon-lg" className="rounded-full" onClick={prev} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="size-5" />
          </Button>
          <div className="relative flex-1">
            <PageSlider page={page} total={total} bookmarks={book?.bookmarks.map((b) => b.page) ?? []} onChange={go} />
          </div>
          {jump === null ? (
            <button
              onClick={() => setJump(String(page))}
              className="min-w-[4.5rem] rounded-full border bg-card px-3 py-1.5 text-center text-xs font-medium tabular-nums transition hover:border-primary/50"
              aria-label="Go to page"
            >
              {page} <span className="text-muted-foreground">/ {total}</span>
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = parseInt(jump, 10);
                if (!isNaN(n)) go(n);
                setJump(null);
              }}
            >
              <input
                autoFocus
                inputMode="numeric"
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
                onBlur={() => setJump(null)}
                className="w-[4.5rem] rounded-full border border-primary bg-card px-3 py-1.5 text-center text-base font-medium tabular-nums outline-none sm:text-xs"
              />
            </form>
          )}
          <Button variant="ghost" size="icon-lg" className="rounded-full" onClick={next} disabled={page >= total} aria-label="Next page">
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </footer>

      <SidePanel
        open={!!panel}
        tab={panel ?? "notes"}
        onTab={(t) => setPanel(t)}
        onOpenChange={(o) => !o && setPanel(null)}
        side={isDesktop ? "right" : "bottom"}
        book={book}
        page={page}
        onGo={(n) => {
          go(n);
          if (!isDesktop) setPanel(null);
        }}
        onChange={setBook}
      />
    </div>
  );
}

function PageSlider({ page, total, bookmarks, onChange }: { page: number; total: number; bookmarks: number[]; onChange: (n: number) => void }) {
  const [local, setLocal] = useState(page);
  useEffect(() => setLocal(page), [page]);
  const pctOf = (n: number) => (total > 1 ? ((n - 1) / (total - 1)) * 100 : 0);
  return (
    <div className="relative h-8">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pctOf(local)}%` }} />
      </div>
      {bookmarks.map((b) => (
        <span key={b} className="pointer-events-none absolute top-0.5 h-2 w-0.5 -translate-x-1/2 rounded-full bg-primary/70" style={{ left: `${pctOf(b)}%` }} />
      ))}
      <input
        type="range"
        min={1}
        max={Math.max(total, 1)}
        value={local}
        onChange={(e) => setLocal(+e.target.value)}
        onPointerUp={() => onChange(local)}
        onKeyUp={() => onChange(local)}
        onTouchEnd={() => onChange(local)}
        aria-label="Page"
        className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
      />
    </div>
  );
}

function SidePanel({
  open,
  tab,
  onTab,
  onOpenChange,
  side,
  book,
  page,
  onGo,
  onChange,
}: {
  open: boolean;
  tab: "bookmarks" | "notes";
  onTab: (t: "bookmarks" | "notes") => void;
  onOpenChange: (o: boolean) => void;
  side: "right" | "bottom";
  book: BookMeta | null;
  page: number;
  onGo: (n: number) => void;
  onChange: (b: BookMeta) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);

  const saveNote = async () => {
    const text = draft.trim();
    if (!text || !book) return;
    const now = Date.now();
    const nb = await updateBook(book.id, (b) => ({
      notes: editing
        ? b.notes.map((n) => (n.id === editing.id ? { ...n, text, updatedAt: now } : n))
        : [...b.notes, { id: uid(), page, text, createdAt: now, updatedAt: now }],
    }));
    if (nb) onChange(nb);
    setDraft("");
    setEditing(null);
    toast.success(editing ? "Note updated" : `Note saved on page ${page}`);
  };

  const removeNote = async (id: string) => {
    if (!book) return;
    const nb = await updateBook(book.id, (b) => ({ notes: b.notes.filter((n) => n.id !== id) }));
    if (nb) onChange(nb);
    if (editing?.id === id) {
      setEditing(null);
      setDraft("");
    }
  };

  const removeBookmark = async (p: number) => {
    if (!book) return;
    const nb = await updateBook(book.id, (b) => ({ bookmarks: b.bookmarks.filter((x) => x.page !== p) }));
    if (nb) onChange(nb);
  };

  const notes = [...(book?.notes ?? [])].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={side === "bottom"}>
      <SheetContent
        side={side}
        showCloseButton={false}
        onInteractOutside={(e) => side === "right" && e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "flex flex-col gap-0 p-0",
          side === "right" ? "w-full sm:w-[24rem] sm:max-w-[24rem]" :"h-[82dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
        )}
      >
        {side === "bottom" && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted-foreground/30" />}
        <SheetHeader className="flex-row items-center justify-between gap-2 px-4 pt-4 pb-3">
          <div>
            <SheetTitle className="font-heading text-lg">Your reading</SheetTitle>
            <SheetDescription className="text-xs">Synced to your account on every device.</SheetDescription>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => onOpenChange(false)} aria-label="Close panel">
            <X />
          </Button>
        </SheetHeader>
        <Tabs value={tab} onValueChange={(v) => onTab(v as "bookmarks" | "notes")} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="px-4">
            <TabsList className="w-full">
              <TabsTrigger value="notes">
                Notes {!!book?.notes.length && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{book.notes.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="bookmarks">
                Bookmarks {!!book?.bookmarks.length && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{book.bookmarks.length}</Badge>}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="notes" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-4 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {editing ? `Editing note · page ${editing.page}` : `New note · page ${page}`}
                </p>
                {editing && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditing(null);
                      setDraft("");
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote();
                }}
                placeholder="What stood out on this page?"
                className="min-h-24 resize-none bg-card text-base sm:text-sm"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="hidden text-[11px] text-muted-foreground sm:inline">⌘ + Enter to save</span>
                <Button size="sm" className="ml-auto rounded-full px-4" onClick={saveNote} disabled={!draft.trim()}>
                  {editing ? "Update note" : "Save note"}
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {notes.length === 0 ? (
                <EmptyPanel icon={NotebookPen} title="No notes yet" text="Write your first thought about this page above." />
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className={cn("group rounded-xl border bg-card p-3 transition-colors", n.page === page && "border-primary/40 bg-primary/5")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => onGo(n.page)} className="text-xs font-semibold text-primary hover:underline">
                          Page {n.page}
                        </button>
                        <div className="flex items-center gap-0.5">
                          <span className="mr-1 text-[11px] text-muted-foreground">{timeAgo(n.updatedAt)}</span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Edit note"
                            onClick={() => {
                              setEditing(n);
                              setDraft(n.text);
                            }}
                          >
                            <NotebookPen />
                          </Button>
                          <Button variant="ghost" size="icon-xs" aria-label="Delete note" onClick={() => removeNote(n.id)}>
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{n.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="bookmarks" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {!book?.bookmarks.length ? (
              <EmptyPanel icon={Bookmark} title="No saved pages" text="Tap “Save page” at the top to remember a page." />
            ) : (
              <ul className="space-y-2">
                {book.bookmarks.map((b) => (
                  <li key={b.page}>
                    <div
                      className={cn(
                        "group flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40",
                        b.page === page && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <button onClick={() => onGo(b.page)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary tabular-nums">
                          {b.page}
                        </span>
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-sm leading-snug">{b.label}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">Saved {timeAgo(b.createdAt)}</span>
                        </span>
                      </button>
                      <Button variant="ghost" size="icon-xs" aria-label="Remove bookmark" onClick={() => removeBookmark(b.page)}>
                        <X />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function EmptyPanel({ icon: Icon, title, text }: { icon: typeof Bookmark; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
