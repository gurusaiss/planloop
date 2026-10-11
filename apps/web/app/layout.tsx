import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import Shell from "@/components/Shell";
import { display, body, mono } from "./fonts";
import { themeInitScript } from "@/lib/theme";

export const metadata = {
  title: "Automation Platform",
  description: "Describe a task in plain language; review the plan; let it run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}
