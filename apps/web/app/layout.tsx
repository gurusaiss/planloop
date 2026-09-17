import "./globals.css";
import AuthGate from "@/components/AuthGate";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "Automation Platform",
  description: "Describe a task in plain language; review the plan; let it run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>
          <NavBar />
          <main className="shell">{children}</main>
        </AuthGate>
      </body>
    </html>
  );
}
