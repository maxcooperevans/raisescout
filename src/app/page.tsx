"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RaiseForm from "@/components/RaiseForm";
import type { RaiseProfile } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  async function run(raise: RaiseProfile, names: string[], accessKey: string) {
    setLoading(true);
    setError(null);
    setCount(names.length);
    try {
      const res = await fetch("/api/raises", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-key": accessKey },
        body: JSON.stringify({ raise, investors: names }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      // Hand the access key to the results page (same tab) so it can trigger the
      // per-investor research calls. sessionStorage, not the URL (no leaking).
      try {
        sessionStorage.setItem(`rs_key_${data.raiseId}`, accessKey);
      } catch {
        /* sessionStorage unavailable — research just won't auto-trigger */
      }
      router.push(`/raises/${data.raiseId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          RaiseScout
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Paste your raise and a list of investors. Each is researched from public
          sources, scored across six dimensions with cited evidence, and given a
          draft first-touch you review before sending.
        </p>
      </header>

      <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <RaiseForm onSubmit={run} loading={loading} />
      </section>

      {loading && (
        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Researching {count} investor{count === 1 ? "" : "s"} from public sources…
          this runs a live web-search agent per investor and can take a couple of
          minutes. You&rsquo;ll be taken to the ranked results when it completes.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
    </main>
  );
}
