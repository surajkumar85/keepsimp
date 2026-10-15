import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { Analytics } from "@vercel/analytics/next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { themeColors } from "@/lib/pwa"
import { site, pageMetadata } from "@/lib/site"
import { cn } from "@/lib/utils"

const outfitHeading = localFont({
  src: "../node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2",
  variable: "--font-outfit",
  display: "swap",
  weight: "100 900",
})

const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
})

const fontMono = localFont({
  src: "../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  weight: "100 900",
  preload: false,
})

export const metadata: Metadata = {
  ...pageMetadata(
    "Free browser tools for everyday work",
    "Compress, resize and convert images, or format JSON, for free. KeepSimp works in your browser with no account and no file uploads.",
    "/"
  ),
  metadataBase: new URL(site.origin),
  title: {
    default: "KeepSimp — Free browser tools for everyday work",
    template: "%s | KeepSimp",
  },
  applicationName: "KeepSimp",
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "KeepSimp", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: themeColors.light },
    { media: "(prefers-color-scheme: dark)", color: themeColors.dark },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable,
        outfitHeading.variable
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        {process.env.VERCEL_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
