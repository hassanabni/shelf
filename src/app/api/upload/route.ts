import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { json, sessionUser } from "@/lib/server";

export async function POST(req: Request) {
  const user = await sessionUser();
  if (!user) return json({ error: "Please sign in again." }, 401);
  const body = (await req.json()) as HandleUploadBody;
  try {
    const res = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!new RegExp(`^u/${user.id}/files/[a-zA-Z0-9-]{8,64}\\.pdf$`).test(pathname)) throw new Error("Invalid upload path");
        return { allowedContentTypes: ["application/pdf"], maximumSizeInBytes: 200 * 1024 * 1024, addRandomSuffix: false, allowOverwrite: true };
      },
    });
    return json(res);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
}
