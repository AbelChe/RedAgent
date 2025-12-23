import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RedAgent",
  description: "AI-Powered Penetration Testing Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-black text-white" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
