import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoChat — talk to any GitHub repo",
  description:
    "Paste a public GitHub repo URL and ask questions about its code, grounded in the actual files.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
