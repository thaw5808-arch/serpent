import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Button } from "@/components/ui/Button";
import { listReports, reportsEnabled } from "@/services/reports";
import { adminEnabled, isAdmin } from "./auth";
import { signOut } from "./actions";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Reports", robots: { index: false, follow: false } };

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-serif text-[2.5rem] font-semibold leading-tight">Misidentification reports</h1>
      <Suspense fallback={<p className="mt-4 text-ink-2">Loading…</p>}>
        <Reports />
      </Suspense>
    </div>
  );
}

async function Reports() {
  await connection();
  if (!adminEnabled()) {
    return <p className="mt-4 text-ink-2">Admin access is disabled. Set ADMIN_TOKEN on the server to enable it.</p>;
  }
  if (!(await isAdmin())) return <SignInForm />;
  if (!reportsEnabled()) {
    return <p className="mt-4 text-ink-2">Reports need a database. Set DATABASE_URL and run the Prisma migration.</p>;
  }

  let reports: Awaited<ReturnType<typeof listReports>>;
  try {
    reports = await listReports();
  } catch (err) {
    console.error("[admin/reports] read failed:", (err as Error).message);
    return <p className="mt-4 text-critical">Reports could not be loaded. Check the database connection and schema.</p>;
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-2">
          {reports.length} most recent. Turn confirmed errors into catalog fixes in src/data; never copy the user&apos;s text
          into species data without a source.
        </p>
        <form action={signOut}>
          <Button type="submit" variant="secondary">Sign out</Button>
        </form>
      </div>
      {reports.length === 0 ? (
        <p className="mt-6">No reports yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[48rem] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Shown</th>
                <th className="px-4 py-3 font-medium">User says</th>
                <th className="px-4 py-3 font-medium">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    <div className="font-mono text-xs text-ink-2">{r.resultId.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.shownLabel ?? "—"}
                    <div className="text-sm text-ink-2">
                      {r.resultStatus}, {r.displayVenomStatus}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.suggestedSpecies ? <span className="font-medium">{r.suggestedSpecies}</span> : <span className="text-ink-2">—</span>}
                    {r.note && <p className="mt-1 whitespace-pre-wrap text-sm">{r.note}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-2">
                    {r.countryCode ?? "no country"}
                    <div>{r.model}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
