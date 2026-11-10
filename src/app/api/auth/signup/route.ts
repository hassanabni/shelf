import { hashPassword, json, newId, readJson, startSession, toPublic, userPath, writeJson, type ServerUser } from "@/lib/server";

export async function POST(req: Request) {
  const { name = "", username = "", password = "" } = await req.json().catch(() => ({}));
  const uname = String(username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(uname)) return json({ error: "Username must be 3–32 letters, numbers, dots, dashes or underscores." }, 400);
  if (String(password).length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
  if (await readJson(userPath(uname))) return json({ error: "That username is already taken." }, 409);
  const { salt, hash } = await hashPassword(String(password));
  const user: ServerUser = { id: newId(), name: String(name).trim().slice(0, 60) || uname, username: uname, salt, hash, createdAt: Date.now() };
  try {
    await writeJson(userPath(uname), user, false);
  } catch {
    return json({ error: "That username is already taken." }, 409);
  }
  await startSession(toPublic(user));
  return json({ user: toPublic(user) });
}
