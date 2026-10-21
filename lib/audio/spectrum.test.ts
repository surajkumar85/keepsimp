import { describe, expect, it } from "vitest"
import {
  BANDS,
  FFT_SIZE,
  fft,
  LOWEST,
  MOST_COLUMNS,
  SpectrumBuilder,
  spectrumColumns,
} from "./spectrum"

/** The band a frequency lies in, as the builder spaces them. */
const bandOf = (frequency: number, highest: number) =>
  Math.floor(
    (Math.log(frequency / LOWEST) / Math.log(highest / LOWEST)) * BANDS
  )

const tone = (frequency: number, seconds: number, rate: number, level = 0.5) =>
  Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, index) => level * Math.sin((2 * Math.PI * frequency * index) / rate)
  )

describe("the FFT", () => {
  it("gives what a plain DFT gives", () => {
    const size = 16
    const input = Array.from(
      { length: size },
      (_, index) => Math.sin(index * 1.7) + index / 9
    )
    const real = Float64Array.from(input)
    const imaginary = new Float64Array(size)
    fft(real, imaginary)
    for (let k = 0; k < size; k++) {
      let re = 0
      let im = 0
      for (let n = 0; n < size; n++) {
        re += input[n] * Math.cos((-2 * Math.PI * k * n) / size)
        im += input[n] * Math.sin((-2 * Math.PI * k * n) / size)
      }
      expect(real[k]).toBeCloseTo(re, 9)
      expect(imaginary[k]).toBeCloseTo(im, 9)
    }
  })
})

describe("spectrograms", () => {
  it("puts a tone in its band, at its level, in every column", () => {
    const rate = 44100
    const builder = new SpectrumBuilder(rate, rate * 2, 40)
    const sound = tone(1000, 2, rate)
    // Fed in pieces, in stereo, as a file is read.
    for (let at = 0; at < sound.length; at += 4410)
      builder.push([
        sound.subarray(at, at + 4410),
        sound.subarray(at, at + 4410),
      ])
    const spectrum = builder.result()
    expect(spectrum).toMatchObject({
      columns: 40,
      bands: BANDS,
      lowest: LOWEST,
      highest: rate / 2,
    })
    const band = bandOf(1000, rate / 2)
    for (let column = 0; column < 40; column++) {
      const values = spectrum.values.subarray(
        column * BANDS,
        (column + 1) * BANDS
      )
      const brightest = values.indexOf(Math.max(...values))
      expect(
        Math.abs(brightest - band),
        `column ${column}`
      ).toBeLessThanOrEqual(1)
      // A sine at half of full scale (−6 dBFS), its power spread over the
      // band's bins: about −12 dB of the 100 shown, well over the rest.
      expect(values[brightest]).toBeGreaterThan(200)
      expect(values[brightest]).toBeLessThan(250)
      // Far from it, little.
      expect(values[bandOf(8000, rate / 2)]).toBeLessThan(100)
    }
  })

  it("shows silence as nothing, and a sound shorter than one FFT once", () => {
    const silent = new SpectrumBuilder(48000, 48000, 10)
    silent.push([new Float32Array(48000)])
    silent.push([])
    expect(Math.max(...silent.result().values)).toBe(0)
    const short = new SpectrumBuilder(48000, 1000, 10)
    short.push([tone(3000, 1000 / 48000, 48000, 1)])
    const values = short.result().values
    expect(Math.max(...values)).toBeGreaterThan(150)
    // Nothing was heard at all: nothing shown.
    expect(Math.max(...new SpectrumBuilder(48000, 0, 5).result().values)).toBe(
      0
    )
  })

  it("keeps a long file's columns to a few FFTs each", () => {
    const rate = 8000
    const columns = 4
    const builder = new SpectrumBuilder(rate, rate * 60, columns)
    builder.push([tone(440, 60, rate)])
    // More sound than said lands in the last column.
    builder.push([tone(440, 1, rate)])
    const values = builder.result().values
    for (let column = 0; column < columns; column++)
      expect(
        Math.max(...values.subarray(column * BANDS, (column + 1) * BANDS))
      ).toBeGreaterThan(200)
  })

  it("reads a file into a number of columns for its length", () => {
    expect(spectrumColumns(1)).toBe(100)
    expect(spectrumColumns(60)).toBe(1500)
    expect(spectrumColumns(3600)).toBe(MOST_COLUMNS)
    expect(FFT_SIZE).toBe(2048)
  })
})
