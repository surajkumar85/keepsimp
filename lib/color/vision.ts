import Color from "colorjs.io"
import { hex, parseColor, srgb } from "./core"

// Machado, Oliveira & Fernandes (2009), severity 1.0, linear-light sRGB.
const matrices = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}
export type Vision = keyof typeof matrices | "grayscale"
export function simulate(text: string, kind: Vision) {
  const rgb = srgb(parseColor(text)),
    linear = rgb.to("srgb-linear")
  const l = linear.coords as [number, number, number]
  const gray = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
  const coords =
    kind === "grayscale"
      ? [gray, gray, gray]
      : matrices[kind].map((row) =>
          Math.max(
            0,
            Math.min(
              1,
              row.reduce((sum, v, i) => sum + v * l[i], 0)
            )
          )
        )
  return hex(
    new Color("srgb-linear", coords as [number, number, number], rgb.alpha)
  )
}
