import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Créno — Réservations pour salons",
  description: "Réservation en ligne, acompte mobile money et rappels WhatsApp pour salons de beauté.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#8E2457", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
