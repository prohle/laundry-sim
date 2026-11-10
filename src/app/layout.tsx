import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Laundry — a simulated folding machine",
  description:
    "A simulated laundry-folding cabinet, and the instrument that decides whether it is worth building.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
