import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "nAIve physics — Garment manipulation data for Physical AI",
  description: "Real-world garment manipulation datasets structured for robotics, embodied AI, and textile automation research.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
