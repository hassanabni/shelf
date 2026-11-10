import { json, readJson, startSession, toPublic, userPath, verifyPassword, type ServerUser } from "@/lib/server";

export async function POST(req: Request) {
  const { username = "", password = "" } = await req.json().catch(() => ({}));
  const uname = String(username).trim().toLowerCase();
  const user = /^[a-z0-9._-]{3,32}$/.test(uname) ? await readJson<ServerUser>(userPath(uname)) : null;
  if (!user || !(await verifyPassword(String(password), user.salt, user.hash))) return json({ error: "Wrong username or password." }, 401);
  await startSession(toPublic(user));
  return json({ user: toPublic(user) });
}
