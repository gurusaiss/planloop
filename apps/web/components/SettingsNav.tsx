"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/workspace", label: "Workspace & Members" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/providers", label: "AI Providers" },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="row" style={{ marginBottom: 20, flexWrap: "wrap" }}>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href}>
          <button className={pathname === t.href ? "" : "secondary"}>{t.label}</button>
        </Link>
      ))}
    </div>
  );
}
