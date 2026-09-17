import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Automation Platform",
  description: "Describe a task in plain language; review the plan; let it run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <span className="brand">Automation Platform</span>
          <Link href="/">New automation</Link>
          <Link href="/automations">Automations</Link>
          <Link href="/runs">Runs</Link>
        </nav>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
