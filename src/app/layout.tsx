import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fold — photo to crease pattern",
  description:
    "Photograph an object, get a crease pattern and a step-by-step fold plan.",
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
