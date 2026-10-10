/** Decimal identity without passing through an IEEE-754 number. */
export function decimalIdentity(raw: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(raw)!
  if ((match[4]?.length ?? 0) > 1000)
    throw new Error(
      "Use numeric exponents shorter than 1,000 digits for comparison."
    )
  let digits = (match[2] + (match[3] ?? "")).replace(/^0+/u, "")
  if (!digits) return "0"
  const trailing = digits.length - digits.replace(/0+$/u, "").length
  digits = digits.slice(0, digits.length - trailing)
  return `${match[1]}${digits}e${BigInt(match[4] ?? "0") - BigInt(match[3]?.length ?? 0) + BigInt(trailing)}`
}
export function safeNativeNumber(raw: string) {
  const number = Number(raw)
  if (
    !Number.isFinite(number) ||
    (Number.isInteger(number) && !Number.isSafeInteger(number))
  )
    return false
  // Very long exponents cannot be compared cheaply, even when padded with zeroes.
  if (raw.split(/[eE]/u)[1]?.length > 1000) return false
  return decimalIdentity(raw) === decimalIdentity(String(number))
}
export function integerToken(raw: string) {
  const identity = decimalIdentity(raw)
  return identity === "0" || BigInt(identity.split("e")[1]) >= BigInt(0)
}
