"use client";

import Link from "next/link";
import { clearToken } from "@/lib/auth";

export default function NavBar() {
  return (
    <nav>
      <span className="brand">Automation Platform</span>
      <Link href="/">New automation</Link>
      <Link href="/automations">Automations</Link>
      <Link href="/runs">Runs</Link>
      <button
        className="secondary"
        style={{ padding: "6px 12px", fontSize: 13 }}
        onClick={() => {
          clearToken();
          window.location.href = "/";
        }}
      >
        Disconnect
      </button>
    </nav>
  );
}
