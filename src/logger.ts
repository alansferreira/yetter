export function logDebug(message: string): void {
  if (process.env.NODE_ENV !== 'test') {
    // Keep logger silent in tests; useful for local debug hooks.
    console.debug(message)
  }
}
