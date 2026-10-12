"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { signIn } from "./actions";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="mt-6 max-w-sm space-y-4">
      <div>
        <label htmlFor="admin-token" className="block text-sm font-medium">Admin token</label>
        <input
          id="admin-token"
          name="token"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 block min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-[16px]"
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-[15px] text-critical">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Sign in"}</Button>
    </form>
  );
}
