export function parseCurrencyCents(value: string) { const match = value.replace(/,/g, "").match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/); return match ? Math.round(Number(match[1]) * 100) : null }
export function formatCents(cents: number) { return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
export function roundToPolicy(cents: number, rounding: "none" | "5" | "10") { const increment = rounding === "5" ? 500 : rounding === "10" ? 1000 : 1; return Math.ceil(cents / increment) * increment }
