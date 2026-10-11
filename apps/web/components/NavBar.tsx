"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { IconMark, IconBell, IconUsers, IconShield, IconLogout, IconLayers } from "./icons";
import ThemeToggle from "./ThemeToggle";

export default function NavBar() {
  const pathname = usePathname();
  const { user, workspaces, activeWorkspaceId, activeWorkspace, switchWorkspace, logout } = useAuth();
  const isSystemAdmin = user?.role === "owner" || user?.role === "admin";

  const navLink = (href: string, label: string) => (
    <Link href={href} className={pathname === href ? "nav-active" : undefined}>
      {label}
    </Link>
  );

  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();

  return (
    <nav>
      <Link href="/" className="brand">
        <IconMark className="mark" />
        Automation Platform
      </Link>

      {navLink("/", "New automation")}
      {navLink("/automations", "Automations")}
      {navLink("/runs", "Runs")}

      <span style={{ flex: "0 0 1px", alignSelf: "stretch", background: "var(--border)", margin: "0 2px" }} />

      <Link href="/notifications" title="Notifications" aria-label="Notifications" className="nav-icon-link">
        <IconBell size={17} />
      </Link>
      <Link href="/settings/workspace" title="Workspace & members" aria-label="Workspace" className="nav-icon-link">
        <IconUsers size={17} />
      </Link>
      {isSystemAdmin && (
        <Link href="/admin" title="Admin" aria-label="Admin" className="nav-icon-link">
          <IconShield size={17} />
        </Link>
      )}

      {workspaces.length > 1 && (
        <select
          value={activeWorkspaceId ?? ""}
          onChange={(e) => switchWorkspace(e.target.value)}
          aria-label="Active workspace"
          className="workspace-select"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}

      <ThemeToggle />

      <Link href="/settings/profile" className="user-chip" title={`${user?.name} · ${activeWorkspace?.role ?? ""}`}>
        <span className="user-avatar">{initial}</span>
        <span className="user-name">{user?.name}</span>
      </Link>
      <button
        className="secondary nav-icon-link"
        style={{ padding: 6, width: 30, height: 30 }}
        onClick={() => logout()}
        title="Log out"
        aria-label="Log out"
      >
        <IconLogout size={16} />
      </button>
    </nav>
  );
}
