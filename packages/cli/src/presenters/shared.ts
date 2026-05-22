// Shared key-parsing utilities for presenters. Kept tiny on purpose
// — anything more presenter-specific lives in the presenter file.

export function parseDigitKey(input: string): number | null {
  if (input.length !== 1) return null;
  const n = Number(input);
  if (!Number.isInteger(n)) return null;
  return n;
}
