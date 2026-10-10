"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import NavBar from "./NavBar";

const PUBLIC_PATHS = ["/login", "/register", "/reset-password", "/invite"];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user } = useAuth();
  const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace(`/login?next=${encodeURIComponent(pathname ?? "/")}`);
    }
  }, [loading, user, isPublic, pathname, router]);

  if (isPublic) return <main className="shell">{children}</main>;

  if (loading) {
    return (
      <main className="shell" style={{ paddingTop: 80 }}>
        <div className="skeleton" />
      </main>
    );
  }

  if (!user) return null; // redirect effect above will navigate away

  return (
    <>
      <NavBar />
      <main className="shell">{children}</main>
    </>
  );
}
