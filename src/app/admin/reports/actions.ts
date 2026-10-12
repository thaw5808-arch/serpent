"use server";
import { cookies, headers } from "next/headers";
import { rateLimit } from "@/lib/rateLimit";
import { ADMIN_COOKIE, safeEqual, sessionValue } from "./auth";

export async function signIn(_prev: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return { error: "Admin access is disabled." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (!rateLimit(`admin-signin:${ip}`, 5, 15 * 60_000).allowed) return { error: "Too many attempts. Try again later." };

  if (!safeEqual(String(form.get("token") ?? ""), token)) return { error: "That token is not correct." };

  (await cookies()).set(ADMIN_COOKIE, sessionValue(token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 8 * 60 * 60,
  });
  return null;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
}
