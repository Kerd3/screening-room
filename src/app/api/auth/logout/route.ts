import { handle } from "@/lib/api";
import { getSession } from "@/lib/auth";

export const POST = handle(async () => {
  const session = await getSession();
  session.destroy();
  return Response.json({ ok: true });
});
