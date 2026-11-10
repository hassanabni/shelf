"use client";

/**
 * Data layer. The cloud (Vercel Blob, private) is the source of truth so a library
 * follows its account to any device. IndexedDB keeps a per-user local copy of
 * metadata and PDF files: books open instantly, work offline, and changes made
 * offline are pushed the next time the app is online.
 */
import { get, set, del, createStore, type UseStore } from "idb-keyval";
import { upload } from "@vercel/blob/client";

export type Bookmark = { page: number; label: string; createdAt: number };
export type Note = { id: string; page: number; text: string; createdAt: number; updatedAt: number };

export type BookMeta = {
  id: string;
  title: string;
  fileName: string;
  size: number;
  pages: number;
  cover?: string;
  addedAt: number;
  lastOpenedAt?: number;
  lastPage: number;
  bookmarks: Bookmark[];
  notes: Note[];
};

let _user = "";
let _meta: UseStore | null = null;
let _files: UseStore | null = null;

export function setDbUser(userId: string) {
  if (userId === _user) return;
  _user = userId;
  _meta = _files = null;
}
const need = () => {
  if (!_user) throw new Error("Not signed in");
  return _user;
};
const metaStore = () => (_meta ??= createStore(`shelf-cache-meta-${need()}`, "books"));
const fileStore = () => (_files ??= createStore(`shelf-cache-files-${need()}`, "pdfs"));
const PENDING = "__pending"; // { [bookId]: Partial<BookMeta> } waiting to reach the cloud

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {}
}

const sortBooks = (b: BookMeta[]) => b.sort((x, y) => (y.lastOpenedAt ?? y.addedAt) - (x.lastOpenedAt ?? x.addedAt));

async function cachedBooks(): Promise<BookMeta[]> {
  const all = ((await get<Record<string, BookMeta>>("all", metaStore())) ?? {}) as Record<string, BookMeta>;
  return Object.values(all);
}
async function cacheBook(b: BookMeta) {
  const all = ((await get<Record<string, BookMeta>>("all", metaStore())) ?? {}) as Record<string, BookMeta>;
  all[b.id] = b;
  await set("all", all, metaStore());
}
async function uncacheBook(id: string) {
  const all = ((await get<Record<string, BookMeta>>("all", metaStore())) ?? {}) as Record<string, BookMeta>;
  delete all[id];
  await set("all", all, metaStore());
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (res.status === 401) {
    window.dispatchEvent(new Event("shelf:signed-out"));
    throw new Error("Signed out");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res;
}

// ---------- queue: all writes run one at a time, in order ----------
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

async function pushPatch(id: string, patch: Partial<BookMeta>) {
  const pending = ((await get<Record<string, Partial<BookMeta>>>(PENDING, metaStore())) ?? {}) as Record<string, Partial<BookMeta>>;
  const merged = { ...(pending[id] ?? {}), ...patch };
  try {
    await api(`/api/books/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(merged) });
    delete pending[id];
  } catch {
    pending[id] = merged; // offline: retry on next sync
  }
  await set(PENDING, pending, metaStore());
}

/** Send anything that was changed while offline. */
export function flushPending() {
  return serial(async () => {
    const pending = ((await get<Record<string, Partial<BookMeta>>>(PENDING, metaStore())) ?? {}) as Record<string, Partial<BookMeta>>;
    for (const [id, patch] of Object.entries(pending)) await pushPatch(id, patch);
  });
}

/** Cloud list merged into the local cache. Falls back to the cache when offline. */
export async function listBooks(): Promise<BookMeta[]> {
  try {
    await flushPending();
    const { books } = (await (await api("/api/books")).json()) as { books: BookMeta[] };
    const all: Record<string, BookMeta> = {};
    for (const b of books) all[b.id] = b;
    await set("all", all, metaStore());
    // Drop cached files for books deleted on another device.
    for (const id of await cachedFileIds()) if (!all[id]) await del(id, fileStore());
    return sortBooks(books);
  } catch (e) {
    if ((e as Error).message === "Signed out") throw e;
    return sortBooks(await cachedBooks());
  }
}

export async function listCachedBooks() {
  return sortBooks(await cachedBooks());
}

async function cachedFileIds() {
  const { keys } = await import("idb-keyval");
  return (await keys(fileStore())) as string[];
}

export async function getBook(id: string): Promise<BookMeta | undefined> {
  const local = (await cachedBooks()).find((b) => b.id === id);
  if (local) return local;
  return (await listBooks()).find((b) => b.id === id);
}

/** Fresh copy from the cloud (another device may have moved on). */
export async function refreshBook(id: string): Promise<BookMeta | undefined> {
  try {
    const books = await listBooks();
    return books.find((b) => b.id === id);
  } catch {
    return undefined;
  }
}

export async function getBookFile(id: string, onProgress?: (pct: number) => void): Promise<Blob | undefined> {
  const local = await get<Blob>(id, fileStore());
  if (local) return local;
  const res = await api(`/api/books/${id}/file`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total || !onProgress) {
    const blob = await res.blob();
    await set(id, blob, fileStore());
    return blob;
  }
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as BlobPart);
    got += value.length;
    onProgress(Math.round((got / total) * 100));
  }
  const blob = new Blob(chunks, { type: "application/pdf" });
  await set(id, blob, fileStore());
  return blob;
}

export async function saveBook(meta: BookMeta, file: Blob, onProgress?: (pct: number) => void) {
  await upload(`u/${need()}/files/${meta.id}.pdf`, file, {
    access: "private",
    handleUploadUrl: "/api/upload",
    contentType: "application/pdf",
    multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: (e) => onProgress?.(Math.round(e.percentage)),
  });
  await set(meta.id, file, fileStore());
  await cacheBook(meta);
  await serial(() => pushPatch(meta.id, meta));
}

export function updateBook(id: string, patch: Partial<BookMeta> | ((b: BookMeta) => Partial<BookMeta>)) {
  return serial(async () => {
    const cur = (await cachedBooks()).find((b) => b.id === id);
    if (!cur) return undefined;
    const p = typeof patch === "function" ? patch(cur) : patch;
    const next = { ...cur, ...p };
    await cacheBook(next);
    void serial(() => pushPatch(id, p)); // cloud write runs right after, in order
    return next;
  });
}

export async function deleteBook(id: string) {
  await api(`/api/books/${id}`, { method: "DELETE" });
  await del(id, fileStore());
  await uncacheBook(id);
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
