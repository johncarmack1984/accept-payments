export type PaymentStatus = 'paid' | 'unpaid' | 'no_payment_required'

// Mirrors the Lambda's GET /sessions/:id response (SessionStatus in src/main.rs).
export interface SessionStatus {
  id: string
  payment_status: PaymentStatus
  amount_total: number | null
  currency: string | null
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    value === 'paid' || value === 'unpaid' || value === 'no_payment_required'
  )
}

export async function fetchSession(sessionId: string): Promise<SessionStatus> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
  if (!res.ok) {
    throw new Error(`Receipt lookup failed (HTTP ${res.status})`)
  }
  return (await res.json()) as SessionStatus
}

export function formatAmount(
  amountTotal: number | null,
  currency: string | null,
): string | null {
  if (amountTotal == null) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency ?? 'usd').toUpperCase(),
  }).format(amountTotal / 100)
}
