import { filePath, get, isId, sessionUser, unauthorized } from "@/lib/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isId(id)) return new Response("Bad id", { status: 400 });
  const r = await get(filePath(user.id, id), { access: "private" });
  if (!r || r.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(r.stream, {
    headers: { "content-type": "application/pdf", "content-length": String(r.blob.size), "cache-control": "private, max-age=31536000, immutable" },
  });
}
