import bcrypt from "bcryptjs";
import { z } from "zod";
import { clientKey, enforce, handle, HttpError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";

const body = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(40),
  email: z.email("Enter a valid email address.").transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
});

export const POST = handle(async (req: Request) => {
  enforce(limiters.write, clientKey(req));
  const { name, email, password } = body.parse(await req.json());

  if (await db.user.findUnique({ where: { email } })) {
    throw new HttpError(409, "An account with that email already exists. Log in instead.");
  }
  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      preference: { create: {} },
    },
  });

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  return Response.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
});
