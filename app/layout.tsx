import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoChat",
  description: "Ask questions about any public GitHub repository.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
