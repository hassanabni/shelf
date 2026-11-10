"use client";

export type PublicUser = { id: string; name: string; username: string; createdAt: number };

const HAS_ACCOUNT = "shelf:has-account";

async function call(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

const remember = (u: PublicUser) => {
  try {
    localStorage.setItem(HAS_ACCOUNT, "1");
    localStorage.setItem("shelf:last-user", JSON.stringify(u));
  } catch {}
  return u;
};

export async function signUp(name: string, username: string, password: string): Promise<PublicUser> {
  return remember((await call("/api/auth/signup", { name, username, password })).user);
}

export async function signIn(username: string, password: string): Promise<PublicUser> {
  return remember((await call("/api/auth/signin", { username, password })).user);
}

/** Server session first; if offline, fall back to the last signed-in user so reading still works. */
export async function currentUser(): Promise<PublicUser | null> {
  try {
    const { user } = await call("/api/auth/me");
    if (!user) localStorage.removeItem("shelf:last-user");
    return user ? remember(user) : null;
  } catch {
    try {
      const u = localStorage.getItem("shelf:last-user");
      return u ? (JSON.parse(u) as PublicUser) : null;
    } catch {
      return null;
    }
  }
}

export function hasAccountHere() {
  try {
    return localStorage.getItem(HAS_ACCOUNT) === "1";
  } catch {
    return false;
  }
}

export async function signOut() {
  try {
    localStorage.removeItem("shelf:last-user");
  } catch {}
  await call("/api/auth/signout", {}).catch(() => {});
}
