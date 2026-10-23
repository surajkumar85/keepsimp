/**
 * Settings in groups, as the settings cards fold them: which groups differ
 * from the usual, and the change that puts one back. Pure, so every tool's
 * panel and its tests share it.
 */

/** A group's settings, by name. */
export type Groups<T, G extends string> = Record<G, readonly (keyof T)[]>

function same(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/** Whether any of a group's settings differs from the usual. */
export function differs<T>(
  settings: T,
  usual: T,
  keys: readonly (keyof T)[]
): boolean {
  return keys.some((key) => !same(settings[key], usual[key]))
}

/** The groups that differ from the usual, in their order. */
export function changedGroups<T, G extends string>(
  settings: T,
  usual: T,
  groups: Groups<T, G>
): G[] {
  return (Object.keys(groups) as G[]).filter((group) =>
    differs(settings, usual, groups[group])
  )
}

/** The change that puts a group's settings back to the usual. */
export function resetOf<T>(usual: T, keys: readonly (keyof T)[]): Partial<T> {
  const change: Partial<T> = {}
  for (const key of keys) change[key] = usual[key]
  return change
}

/** The change that puts every group back. */
export function resetAll<T, G extends string>(
  usual: T,
  groups: Groups<T, G>
): Partial<T> {
  return resetOf(usual, (Object.values(groups) as (keyof T)[][]).flat())
}

/** Parts of a summary joined into one line, empty parts left out. */
export function line(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" · ")
}
