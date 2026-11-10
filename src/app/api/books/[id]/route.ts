import { del, filePath, isId, json, metaPath, readJson, sessionUser, unauthorized, writeJson } from "@/lib/server";

const EDITABLE = ["title", "fileName", "size", "pages", "cover", "addedAt", "lastOpenedAt", "lastPage", "bookmarks", "notes"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isId(id)) return json({ error: "Bad id" }, 400);
  const patch = await req.json().catch(() => null);
  if (!patch || typeof patch !== "object") return json({ error: "Bad body" }, 400);
  const cur = (await readJson<Record<string, unknown>>(metaPath(user.id, id))) ?? { id, bookmarks: [], notes: [], lastPage: 1 };
  const next: Record<string, unknown> = { ...cur, id, updatedAt: Date.now() };
  for (const k of EDITABLE) if (k in patch) next[k] = patch[k];
  // Reading position: keep the most recent one if two devices race.
  if (typeof patch.lastOpenedAt === "number" && typeof cur.lastOpenedAt === "number" && patch.lastOpenedAt < cur.lastOpenedAt) {
    next.lastOpenedAt = cur.lastOpenedAt;
    next.lastPage = cur.lastPage;
  }
  await writeJson(metaPath(user.id, id), next);
  return json({ book: next });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isId(id)) return json({ error: "Bad id" }, 400);
  await del([metaPath(user.id, id), filePath(user.id, id)]).catch(() => {});
  return json({ ok: true });
}
