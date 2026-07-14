// services/crm/formatting.ts
//
// Token/cost formatting shared across the Inbound Chats admin surfaces
// (InboundChatsTable, SessionDrawer). Pure, no React — safe to import from
// client components. Anthropic pricing (claude-sonnet-4-6): $3 / 1M input
// tokens, $15 / 1M output tokens — approximate, does not reflect cache
// discounts or fallback model usage.

export const INPUT_COST_PER_MILLION = 3
export const OUTPUT_COST_PER_MILLION = 15

export function formatTokens(input: number | null, output: number | null): string {
  const total = (input ?? 0) + (output ?? 0)
  return total.toLocaleString('en-US')
}

export function formatCost(input: number | null, output: number | null): string {
  const dollars =
    ((input ?? 0) * INPUT_COST_PER_MILLION + (output ?? 0) * OUTPUT_COST_PER_MILLION) / 1_000_000
  return `$${dollars.toFixed(4)}`
}
