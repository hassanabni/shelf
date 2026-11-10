import { json, sessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function GET() {
  return json({ user: await sessionUser() });
}
