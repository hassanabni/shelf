import { json, listPaths, readJson, sessionUser, unauthorized } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const paths = await listPaths(`u/${user.id}/books/`);
  const books = (await Promise.all(paths.map((p) => readJson(p)))).filter(Boolean);
  return json({ books });
}
