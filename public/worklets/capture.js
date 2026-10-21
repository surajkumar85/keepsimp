/**
 * Takes the microphone's sound as the page hears it, 32-bit floats, and
 * hands it to the page about every 21 ms (1,024 frames at 48 kHz), one
 * array per channel, transferred rather than copied. It changes nothing.
 * Asked to ("flush"), it hands over what it holds at once, followed by
 * "flushed", so the end of a take is kept too. Plain JavaScript without
 * imports: an audio worklet is loaded by its address, and the offline copy
 * keeps it like any file of the site.
 */
const FRAMES = 1024

class Capture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.held = []
    this.count = 0
    this.port.onmessage = (event) => {
      if (event.data !== "flush") return
      this.send()
      this.port.postMessage("flushed")
    }
  }

  send() {
    if (!this.count) return
    const channels = this.held[0].length
    const planes = Array.from({ length: channels }, (_, channel) => {
      const plane = new Float32Array(this.count)
      let at = 0
      for (const block of this.held) {
        plane.set(block[channel] ?? block[0], at)
        at += block[0].length
      }
      return plane
    })
    this.port.postMessage(
      planes,
      planes.map((plane) => plane.buffer)
    )
    this.held = []
    this.count = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (input && input.length) {
      // The engine reuses its arrays: each is copied before it is kept.
      this.held.push(input.map((channel) => channel.slice()))
      this.count += input[0].length
      if (this.count >= FRAMES) this.send()
    }
    return true
  }
}

registerProcessor("keepsimp-capture", Capture)
