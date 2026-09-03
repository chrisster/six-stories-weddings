import type { Metadata } from "next";
import { Suspense } from "react";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { NavigationLoader } from "@/components/ui/navigation-loader";
import { RecoveryRedirect } from "@/components/auth/recovery-redirect";
import "./globals.css";

const headingFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Six Stories Weddings",
  description: "Private wedding project management and cinematic client galleries.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Reads the search params, which must sit under a Suspense boundary
            so the statically prerendered pages keep their static shell. */}
        <Suspense fallback={null}>
          <NavigationLoader />
        </Suspense>
        <RecoveryRedirect />
        {children}
      </body>
    </html>
  );
}
