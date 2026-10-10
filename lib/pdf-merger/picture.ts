import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import { orientedSize } from "@/lib/image-compressor/geometry"

/** How large a page a picture gets. */
export type PicturePage = "previous" | "fit" | "a4" | "letter"
export type PictureMargin = "none" | "small" | "normal"

/** Pixels per inch when the page is made to fit the picture. */
export const FIT_DPI = 150

const sheets: Record<"a4" | "letter", Size> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
}
const margins: Record<PictureMargin, number> = {
  none: 0,
  small: 18,
  normal: 36,
}
const round = (value: number) => Math.round(value * 100) / 100

/**
 * The orientation a JPEG's EXIF data asks for, from 1 to 8; 1 (upright) when
 * the file says nothing. Reads only the headers, never the picture.
 */
export function jpegOrientation(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return 1
  let offset = 2
  while (offset + 4 <= bytes.length) {
    const marker = view.getUint16(offset)
    // Past the headers: the picture itself starts.
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1
    const size = view.getUint16(offset + 2)
    const start = offset + 4
    if (
      marker === 0xffe1 &&
      start + 14 <= bytes.length &&
      view.getUint32(start) === 0x45786966 &&
      view.getUint16(start + 4) === 0
    ) {
      const tiff = start + 6
      const little = view.getUint16(tiff) === 0x4949
      const directory = tiff + view.getUint32(tiff + 4, little)
      if (directory + 2 > bytes.length) return 1
      const count = view.getUint16(directory, little)
      for (let entry = 0; entry < count; entry++) {
        const at = directory + 2 + entry * 12
        if (at + 12 > bytes.length) return 1
        if (view.getUint16(at, little) === 0x0112) {
          const value = view.getUint16(at + 8, little)
          return value >= 1 && value <= 8 ? value : 1
        }
      }
      return 1
    }
    offset = start + size - 2
  }
  return 1
}

/**
 * The clockwise turn an EXIF orientation stands for, or null when it also
 * mirrors the picture, which a turn alone cannot show.
 */
export function quarterTurns(orientation: number): Rotation | null {
  const turns: Record<number, Rotation> = { 1: 0, 3: 180, 6: 90, 8: 270 }
  return turns[orientation] ?? null
}

export interface PictureLayout {
  /** The page, in points. */
  page: Size
  /** The six numbers that place the picture on it (a PDF "cm" matrix). */
  matrix: [number, number, number, number, number, number]
}

/**
 * Where a picture goes on its page.
 * @param picture Its size in pixels, as stored.
 * @param turn The clockwise turn it needs to be shown upright.
 * @param previous The size of the page before it; A4 stands in when there is none.
 */
export function pictureLayout(
  picture: Size,
  turn: Rotation,
  choice: PicturePage,
  margin: PictureMargin,
  previous: Size | null
): PictureLayout {
  const shown = orientedSize(picture, turn)
  let page: Size
  let box: { x: number; y: number; width: number; height: number }
  if (choice === "fit") {
    page = {
      width: round((shown.width * 72) / FIT_DPI),
      height: round((shown.height * 72) / FIT_DPI),
    }
    box = { x: 0, y: 0, ...page }
  } else {
    const sheet =
      choice === "previous" ? (previous ?? sheets.a4) : sheets[choice]
    // The sheet is turned to suit the picture, as a printer would feed it.
    const [short, long] = [
      Math.min(sheet.width, sheet.height),
      Math.max(sheet.width, sheet.height),
    ]
    page =
      shown.width > shown.height
        ? { width: long, height: short }
        : { width: short, height: long }
    const space = Math.min(margins[margin], page.width / 4, page.height / 4)
    const scale = Math.min(
      (page.width - space * 2) / shown.width,
      (page.height - space * 2) / shown.height
    )
    const width = round(shown.width * scale)
    const height = round(shown.height * scale)
    box = {
      x: round((page.width - width) / 2),
      y: round((page.height - height) / 2),
      width,
      height,
    }
  }
  // A picture fills the unit square; these numbers stretch, turn and move it.
  const { x, y, width, height } = box
  const matrix: PictureLayout["matrix"] =
    turn === 90
      ? [0, -height, width, 0, x, y + height]
      : turn === 180
        ? [-width, 0, 0, -height, x + width, y + height]
        : turn === 270
          ? [0, height, -width, 0, x + width, y]
          : [width, 0, 0, height, x, y]
  return { page, matrix }
}
