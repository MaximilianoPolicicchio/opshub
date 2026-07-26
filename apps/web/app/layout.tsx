import type { Metadata } from "next";
import { ReactNode } from "react";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "OpsHub — Project Command Center",
  description: "Single-owner operations platform for products, client work, time and budgets.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
