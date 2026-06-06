"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const path = usePathname();
  const isHome = path === "/";

  return (
    <nav className="flex items-center justify-between border-b border-zinc-100 bg-white px-4 py-3">
      <span className="text-sm font-semibold tracking-tight text-zinc-900">
        RaiseScout
      </span>
      {isHome ? (
        <a
          href="https://www.maxcooperevans.com"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          ← Home
        </a>
      ) : (
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Run another search
        </Link>
      )}
    </nav>
  );
}
