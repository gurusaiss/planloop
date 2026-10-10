"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

export default function NavBar() {
  const pathname = usePathname();
  const { user, workspaces, activeWorkspaceId, activeWorkspace, switchWorkspace, logout } = useAuth();
  const isSystemAdmin = user?.role === "owner" || user?.role === "admin";

  const link = (href: string, label: string) => (
    <Link href={href} style={pathname === href ? { color: "#e8eaed" } : undefined}>
      {label}
    </Link>
  );

  return (
    <nav>
      <span className="brand">Automation Platform</span>
      {link("/", "New automation")}
      {link("/automations", "Automations")}
      {link("/runs", "Runs")}
      {link("/notifications", "Notifications")}
      {link("/settings/workspace", "Workspace")}
      {isSystemAdmin && link("/admin", "Admin")}

      {workspaces.length > 1 && (
        <select
          value={activeWorkspaceId ?? ""}
          onChange={(e) => switchWorkspace(e.target.value)}
          style={{
            background: "#14171c",
            color: "#e8eaed",
            border: "1px solid #23272e",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 13,
          }}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}

      <span style={{ color: "#9aa1ab", fontSize: 13 }}>
        {user?.name} {activeWorkspace && `· ${activeWorkspace.role}`}
      </span>
      <Link href="/settings/profile" style={{ fontSize: 13 }}>
        Settings
      </Link>
      <button className="secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => logout()}>
        Log out
      </button>
    </nav>
  );
}
