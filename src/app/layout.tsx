import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { CommandPaletteProvider } from "@/components/command-palette-provider";
import { getViewerAuth } from "@/lib/auth";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Absolute base so the opengraph-image / twitter-image file conventions
  // resolve to https://copa.ruy.se/... in shared link previews.
  metadataBase: new URL("https://copa.ruy.se"),
  title: "LA COPA DEL MUNDO 2026",
  description: "Friend-group fantasy league for the 2026 FIFA World Cup",
  openGraph: {
    title: "LA COPA DEL MUNDO 2026",
    description: "Vänligans fantasy-liga för Fotbolls-VM 2026.",
    url: "https://copa.ruy.se",
    siteName: "LA COPA DEL MUNDO 2026",
    locale: "sv_SE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LA COPA DEL MUNDO 2026",
    description: "Vänligans fantasy-liga för Fotbolls-VM 2026.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const viewer = await getViewerAuth();
  return (
    <ClerkProvider>
      <html lang="sv" className={`${geistMono.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">
          {children}
          <CommandPaletteProvider
            signedIn={viewer.signedIn}
            approved={viewer.approved}
            isAdmin={viewer.isAdmin}
            myTeamSlug={viewer.myTeamSlug}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
