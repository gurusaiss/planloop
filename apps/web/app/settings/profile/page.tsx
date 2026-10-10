"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";
import SettingsNav from "@/components/SettingsNav";

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameMsg(null);
    try {
      await api.updateProfile(name);
      await refresh();
      setNameMsg("Saved.");
    } catch (e: any) {
      setNameMsg(e.message);
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPw(true);
    setPwError(null);
    setPwDone(false);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwDone(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (e: any) {
      setPwError(e.message);
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <SettingsNav />

      <div className="card">
        <h2>Profile</h2>
        <form onSubmit={saveName}>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 300 }} />
            <button type="submit" disabled={savingName}>{savingName ? "Saving…" : "Save name"}</button>
          </div>
        </form>
        {nameMsg && <p style={{ fontSize: 13, color: "#9aa1ab", marginTop: 8 }}>{nameMsg}</p>}
        <p style={{ fontSize: 13, color: "#9aa1ab", marginTop: 12 }}>Email: {user?.email} · Account role: {user?.role}</p>
      </div>

      <div className="card">
        <h2>Change password</h2>
        <form onSubmit={changePassword}>
          <div style={{ marginBottom: 10 }}>
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <input
              type="password"
              placeholder="New password (min 10 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={10}
              required
            />
          </div>
          {pwError && <div className="error-box" style={{ marginBottom: 10 }}>{pwError}</div>}
          {pwDone && <p style={{ fontSize: 13, color: "#3fb950", marginBottom: 10 }}>Password changed. Other sessions were logged out.</p>}
          <button type="submit" disabled={savingPw}>{savingPw ? "Changing…" : "Change password"}</button>
        </form>
      </div>

      <div className="card">
        <h2>Sessions</h2>
        <p style={{ fontSize: 13, color: "#9aa1ab", marginBottom: 12 }}>Sign out of this device, or every device this account is logged into.</p>
        <div className="row">
          <button className="secondary" onClick={() => logout()}>Log out here</button>
          <button className="danger" onClick={async () => { await api.logoutAll(); await logout(); }}>Log out everywhere</button>
        </div>
      </div>
    </>
  );
}
