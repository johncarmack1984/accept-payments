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
  const res = await fetch(`/sessions/${encodeURIComponent(sessionId)}`)
  if (!res.ok) {
    throw new Error(`Receipt lookup failed (HTTP ${res.status})`)
  }
  return (await res.json()) as SessionStatus
}

export function money(cents: number, currency: string | null): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency ?? 'usd').toUpperCase(),
  }).format(cents / 100)
}

export function formatAmount(
  amountTotal: number | null,
  currency: string | null,
): string | null {
  return amountTotal == null ? null : money(amountTotal, currency)
}

export function formatDate(unixSeconds: number): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(
    new Date(unixSeconds * 1000),
  )
}

export type InvoiceStatus = 'open' | 'paid' | 'void'

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_amount_cents: number
}

// Mirrors the Lambda's GET /invoice/:token response (PublicInvoice in src/main.rs).
export interface PublicInvoice {
  number: number
  status: InvoiceStatus
  client_name: string
  po_number: string | null
  line_items: InvoiceLineItem[]
  currency: string
  total: number
  issued_at: number
  due_at: number
  paid_at: number | null
  business_name: string | null
  remit_to: string | null
}

export async function fetchInvoice(token: string): Promise<PublicInvoice> {
  const res = await fetch(`/invoice/${encodeURIComponent(token)}`)
  if (!res.ok) {
    throw new Error(`Invoice lookup failed (HTTP ${res.status})`)
  }
  return (await res.json()) as PublicInvoice
}
