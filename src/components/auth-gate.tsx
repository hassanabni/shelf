"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { currentUser, hasAccountHere, signIn, signOut, signUp, type PublicUser } from "@/lib/auth";
import { setDbUser } from "@/lib/db";

type Ctx = { user: PublicUser; logout: () => void };
const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => useContext(AuthCtx)!;

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);

  useEffect(() => {
    currentUser()
      .then(setUser)
      .catch(() => setUser(null));
    const out = () => {
      setDbUser("");
      setUser(null);
    };
    window.addEventListener("shelf:signed-out", out);
    return () => window.removeEventListener("shelf:signed-out", out);
  }, []);

  if (user === undefined)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );

  if (!user) return <AuthScreen onDone={setUser} />;

  setDbUser(user.id);
  return (
    <AuthCtx.Provider
      value={{
        user,
        logout: async () => {
          await signOut();
          setDbUser("");
          setUser(null);
        },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

function AuthScreen({ onDone }: { onDone: (u: PublicUser) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasAccountHere()) setMode("signup");
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      onDone(mode === "signup" ? await signUp(name, username, password) : await signIn(username, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>
      <div className="relative flex h-16 items-center justify-between px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-heading text-xl font-semibold tracking-tight">Shelf</span>
        </div>
        <ThemeToggle />
      </div>

      <main className="relative flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="text-center">
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {mode === "signin" ? "Welcome back" : "Start your shelf"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin" ? "Sign in to pick up where you left off." : "Create a private reading space just for you."}
            </p>
          </div>

          <div className="mt-8 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as "signin" | "signup");
                setError("");
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={submit} className="mt-5 space-y-4">
              {mode === "signup" && (
                <Field label="Your name" htmlFor="name">
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" autoComplete="name" className="h-10 text-base sm:text-sm" />
                </Field>
              )}
              <Field label="Username" htmlFor="username">
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ada"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  className="h-10 text-base sm:text-sm"
                />
              </Field>
              <Field label="Password" htmlFor="password">
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    className="h-10 pr-10 text-base sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={busy} className="h-10 w-full rounded-full text-[15px]">
                {busy && <Loader2 className="animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </div>

          <p className="mt-5 flex items-start justify-center gap-2 text-center text-xs text-muted-foreground">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
            Your library syncs privately to your account — sign in on any device.
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="Account" className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold ring-1 ring-border transition hover:ring-primary/50">
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium text-foreground">{user.name}</p>
          <p className="text-xs text-muted-foreground">@{user.username}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
