import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import Shell from "@/components/Shell";

export const metadata = {
  title: "Automation Platform",
  description: "Describe a task in plain language; review the plan; let it run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}
