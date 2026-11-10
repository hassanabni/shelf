import { endSession, json } from "@/lib/server";

export async function POST() {
  await endSession();
  return json({ ok: true });
}
