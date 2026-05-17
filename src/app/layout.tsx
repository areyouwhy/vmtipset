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
  title: "LA COPA DEL MUNDO 2026",
  description: "Friend-group fantasy league for the 2026 FIFA World Cup",
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
