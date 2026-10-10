import type { MetadataRoute } from "next"
import { webManifest } from "@/lib/pwa"

export const dynamic = "force-static"
export default function manifest(): MetadataRoute.Manifest {
  return webManifest()
}
