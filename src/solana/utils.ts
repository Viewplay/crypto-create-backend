export function enforceSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(s)) {
    throw new Error("Invalid symbol (1-10 chars, A-Z / 0-9 only)");
  }
  return s;
}