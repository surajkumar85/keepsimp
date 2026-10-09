import type { Metadata } from "next"
import localFont from "next/font/local"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
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
  icons: { icon: "/icon.svg" },
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
      </body>
    </html>
  )
}
