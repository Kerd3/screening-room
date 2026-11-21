import bcrypt from "bcryptjs";
import { z } from "zod";
import { clientKey, enforce, handle, HttpError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";

const body = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

export const POST = handle(async (req: Request) => {
  enforce(limiters.write, clientKey(req));
  const { email, password } = body.parse(await req.json());

  const user = await db.user.findUnique({ where: { email } });
  // Same message for both cases, so the form doesn't reveal which emails exist.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Email or password is incorrect.");
  }

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  return Response.json({ user: { id: user.id, name: user.name, email: user.email } });
});
