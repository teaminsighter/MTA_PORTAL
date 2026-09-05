import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTA Consultant Portal",
  description: "My Top Agent — consultant workspace",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
