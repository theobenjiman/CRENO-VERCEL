"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app", label: "Agenda", d: "M3 9h18M8 2v4M16 2v4M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" },
  { href: "/app/clients", label: "Clientes", d: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 20c0-3-2-5-5-5" },
  { href: "/app/caisse", label: "Caisse", d: "M4 6h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM12 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
  { href: "/app/settings", label: "Réglages", d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" },
];

export default function BottomNav({ isOwner }: { isOwner: boolean }) {
  const path = usePathname();
  const items = isOwner ? ITEMS : ITEMS.slice(0, 1);
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-line">
      <div className={`mx-auto max-w-3xl grid h-19 ${isOwner ? "grid-cols-4" : "grid-cols-1"}`}>
        {items.map((it) => {
          const active = it.href === "/app" ? path === "/app" || path.startsWith("/app/rdv") || path === "/app/new" : path.startsWith(it.href) || (it.href === "/app/settings" && (path.startsWith("/app/abonnement") || path.startsWith("/app/qr")));
          return (
            <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-rose" : "text-muted"}`}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={it.d} /></svg>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
