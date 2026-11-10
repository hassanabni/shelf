import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { pbkdf2, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { get, put, list, del } from "@vercel/blob";

const pbkdf2Async = promisify(pbkdf2);
const COOKIE = "shelf_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

export type ServerUser = { id: string; name: string; username: string; salt: string; hash: string; createdAt: number };
export type PublicUser = Pick<ServerUser, "id" | "name" | "username" | "createdAt">;
export const toPublic = ({ id, name, username, createdAt }: ServerUser): PublicUser => ({ id, name, username, createdAt });

// ---------- Blob JSON helpers (private store) ----------
export async function readJson<T>(pathname: string): Promise<T | null> {
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return (await new Response(r.stream).json()) as T;
}
export async function writeJson(pathname: string, data: unknown, overwrite = true) {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    cacheControlMaxAge: 60,
  });
}
export async function listPaths(prefix: string) {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs.map((b) => b.pathname));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}
export { get, del };

// ---------- Paths ----------
export const userPath = (username: string) => `users/${username}.json`;
export const metaPath = (uid: string, bookId: string) => `u/${uid}/books/${bookId}.json`;
export const filePath = (uid: string, bookId: string) => `u/${uid}/files/${bookId}.pdf`;
export const isId = (s: string) => /^[a-zA-Z0-9-]{8,64}$/.test(s);

// ---------- Passwords ----------
export async function hashPassword(password: string, salt = randomBytes(16).toString("base64")) {
  const hash = (await pbkdf2Async(password, salt, 210_000, 32, "sha256")).toString("base64");
  return { salt, hash };
}
export async function verifyPassword(password: string, salt: string, hash: string) {
  const { hash: h } = await hashPassword(password, salt);
  const a = Buffer.from(h), b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const newId = () => randomUUID();

// ---------- Sessions ----------
export async function startSession(user: PublicUser) {
  const token = await new SignJWT({ name: user.name, username: user.username, createdAt: user.createdAt })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
export async function endSession() {
  (await cookies()).delete(COOKIE);
}
export async function sessionUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: payload.sub!, name: String(payload.name), username: String(payload.username), createdAt: Number(payload.createdAt) };
  } catch {
    return null;
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const unauthorized = () => json({ error: "Please sign in again." }, 401);
