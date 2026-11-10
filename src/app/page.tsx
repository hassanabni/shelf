"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Bookmark,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Trash2,
  Upload,
  Loader2,
  Search,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { UserMenu, useAuth } from "@/components/auth-gate";
import { deleteBook, listBooks, listCachedBooks, requestPersistence, saveBook, uid, type BookMeta } from "@/lib/db";
import { formatBytes, inspectPdf, timeAgo } from "@/lib/pdf";
import { cn } from "@/lib/utils";

const pct = (b: BookMeta) => (b.pages ? Math.round((b.lastPage / b.pages) * 100) : 0);

export default function Library() {
  const router = useRouter();
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [busy, setBusy] = useState(0);
  const [drag, setDrag] = useState(false);
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<BookMeta | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const refresh = useCallback(() => listBooks().then(setBooks).catch(() => {}), []);
  useEffect(() => {
    listCachedBooks().then((c) => c.length && setBooks((b) => b ?? c));
    refresh();
    requestPersistence();
    const onFocus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", refresh);
    };
  }, [refresh, user.id]);

  const addFiles = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!pdfs.length) return toast.error("Please choose a PDF file");
    setBusy(pdfs.length);
    await requestPersistence();
    let lastId = "";
    for (const f of pdfs) {
      try {
        const info = await inspectPdf(f);
        lastId = uid();
        setUploadPct(0);
        await saveBook(
          { id: lastId, title: info.title, fileName: f.name, size: f.size, pages: info.pages, cover: info.cover, addedAt: Date.now(), lastPage: 1, bookmarks: [], notes: [] },
          f,
          setUploadPct,
        );
        toast.success(`Added “${info.title}”`, { description: `${info.pages} pages · synced to your account` });
      } catch (e) {
        console.error(e);
        lastId = "";
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        toast.error(`Couldn't add ${f.name}`, {
          description: offline ? "You're offline. Connect to the internet to upload." : "The file may be damaged, password-protected, or the upload failed.",
        });
      }
      setUploadPct(null);
      setBusy((n) => n - 1);
    }
    await refresh();
    if (pdfs.length === 1 && lastId) router.push(`/read/${lastId}`);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteBook(toDelete.id);
      toast(`Removed “${toDelete.title}”`);
    } catch {
      toast.error("Couldn't remove it right now", { description: "Check your connection and try again." });
    }
    setToDelete(null);
    refresh();
  };

  const filtered = (books ?? []).filter((b) => b.title.toLowerCase().includes(query.toLowerCase()));
  const current = books?.find((b) => b.lastOpenedAt);

  return (
    <div
      className="min-h-dvh"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-heading text-xl font-semibold tracking-tight">Shelf</span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu />
            <Button onClick={() => input.current?.click()} className="h-9 rounded-full px-4" disabled={busy > 0}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              <span className="hidden sm:inline">{busy ? (uploadPct !== null ? `Uploading ${uploadPct}%` : "Reading…") : "Add book"}</span>
              <span className="sm:hidden tabular-nums">{busy ? (uploadPct !== null ? `${uploadPct}%` : "…") : "Add"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {books === null ? (
          <LoadingState />
        ) : books.length === 0 ? (
          <EmptyState onPick={() => input.current?.click()} busy={busy > 0} pct={uploadPct} />
        ) : (
          <>
            {current && (
              <section className="pt-8 sm:pt-10">
                <p className="mb-3 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Continue reading, {user.name.split(" ")[0]}</p>
                <Link
                  href={`/read/${current.id}`}
                  className="group relative flex items-center gap-5 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-md sm:gap-7 sm:p-6"
                >
                  <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/10 blur-3xl" />
                  <Cover book={current} className="w-20 shrink-0 sm:w-28" />
                  <div className="relative min-w-0 flex-1">
                    <h2 className="line-clamp-2 font-heading text-xl leading-tight font-semibold sm:text-3xl">{current.title}</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Page {current.lastPage} of {current.pages} · {timeAgo(current.lastOpenedAt)}
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <Progress value={pct(current)} className="h-1.5 max-w-xs" />
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">{pct(current)}%</span>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      Resume <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </section>
            )}

            <section className="pt-10">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Your library</h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {books.length} {books.length === 1 ? "book" : "books"} · synced to @{user.username}
                  </p>
                </div>
                {books.length > 3 && (
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles" className="h-9 rounded-full pl-9" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 md:grid-cols-4 lg:grid-cols-5">
                {filtered.map((b) => (
                  <BookCard key={b.id} book={b} onDelete={() => setToDelete(b)} />
                ))}
                <button
                  onClick={() => input.current?.click()}
                  className="group flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 hover:text-foreground"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-muted transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Plus className="size-5" />
                  </span>
                  <span className="text-sm font-medium">Add a PDF</span>
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {drag && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-card px-12 py-10 shadow-xl">
            <Upload className="size-8 text-primary" />
            <p className="font-heading text-xl font-semibold">Drop to add to your shelf</p>
          </div>
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this book?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.title}” and its bookmarks and notes will be deleted from your account on every device. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Cover({ book, className }: { book: BookMeta; className?: string }) {
  return (
    <div className={cn("relative aspect-[3/4] overflow-hidden rounded-md bg-muted shadow-[0_1px_2px_rgba(0,0,0,.08),0_8px_24px_-8px_rgba(0,0,0,.25)] ring-1 ring-black/5", className)}>
      {book.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.cover} alt="" className="size-full object-cover object-top" />
      ) : (
        <div className="grid size-full place-items-center bg-gradient-to-br from-primary/20 to-primary/5 p-3 text-center font-heading text-sm font-semibold">{book.title}</div>
      )}
      <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-r from-black/15 to-transparent" />
    </div>
  );
}

function BookCard({ book, onDelete }: { book: BookMeta; onDelete: () => void }) {
  const p = pct(book);
  return (
    <div className="group relative">
      <Link href={`/read/${book.id}`} className="block">
        <Cover book={book} className="transition-transform duration-300 group-hover:-translate-y-1" />
        <h3 className="mt-3 line-clamp-2 text-sm leading-snug font-medium">{book.title}</h3>
      </Link>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{book.lastOpenedAt ? `${p}%` : "New"}</span>
        <span>·</span>
        <span>{book.pages} pp</span>
        {book.bookmarks.length > 0 && (
          <span className="flex items-center gap-0.5">
            · <Bookmark className="size-3" />
            {book.bookmarks.length}
          </span>
        )}
        {book.notes.length > 0 && (
          <span className="flex items-center gap-0.5">
            · <NotebookPen className="size-3" />
            {book.notes.length}
          </span>
        )}
      </div>
      {book.lastOpenedAt && <Progress value={p} className="mt-2 h-1" />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label="Book options"
            className="absolute top-2 right-2 rounded-full bg-background/90 opacity-100 shadow-sm backdrop-blur sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/read/${book.id}`}>
              <BookOpen /> Open
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled className="text-xs">
            {formatBytes(book.size)} · added {timeAgo(book.addedAt)}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EmptyState({ onPick, busy, pct }: { onPick: () => void; busy: boolean; pct: number | null }) {
  return (
    <div className="flex flex-col items-center pt-16 text-center sm:pt-24">
      <div className="relative mb-8">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/15 blur-3xl" />
        <div className="flex items-end gap-1.5">
          {[
            ["h-24", "bg-primary/80"],
            ["h-28", "bg-foreground/80"],
            ["h-20", "bg-primary/40"],
            ["h-26", "bg-foreground/30"],
          ].map(([h, c], i) => (
            <div key={i} className={cn("w-7 rounded-sm shadow-sm", h, c)} />
          ))}
        </div>
        <div className="mt-1 h-1.5 w-40 -translate-x-4 rounded-full bg-border" />
      </div>
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-5xl">A quiet place for your books</h1>
      <p className="mt-4 max-w-md text-base text-pretty text-muted-foreground">
        Upload a PDF, read on any screen, save your page and jot down notes. Your library syncs to your account, so you can pick up right where you left off on any device.
      </p>
      <Button size="lg" onClick={onPick} disabled={busy} className="mt-8 h-11 rounded-full px-6 text-[15px]">
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {busy ? (pct !== null ? `Uploading… ${pct}%` : "Reading your book…") : "Upload a PDF"}
      </Button>
      <p className="mt-3 hidden text-xs text-muted-foreground sm:block">or drop a file anywhere on this page</p>
      <div className="mt-14 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
        {[
          [Bookmark, "Save your page", "One tap remembers exactly where you stopped."],
          [NotebookPen, "Notes per page", "Capture thoughts next to the passage that sparked them."],
          [ShieldCheck, "Private and synced", "Your books are stored privately and follow your account to every device."],
        ].map(([Icon, t, d]) => {
          const I = Icon as typeof Bookmark;
          return (
            <div key={t as string} className="rounded-xl border bg-card p-4">
              <I className="size-5 text-primary" />
              <p className="mt-3 text-sm font-medium">{t as string}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d as string}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 pt-10 sm:grid-cols-3 sm:gap-x-6 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[3/4] rounded-md" />
          <Skeleton className="mt-3 h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
