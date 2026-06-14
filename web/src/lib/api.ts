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

// --- Admin auth (GitHub OAuth; the session is an HttpOnly cookie set by the API) ---

// thrown when the session is missing or rejected, so the UI can show the gate
export class AuthError extends Error {
  constructor() {
    super('Not signed in')
    this.name = 'AuthError'
  }
}

// The full admin view (GET /invoices); PublicInvoice is the client-facing subset.
export interface Invoice {
  id: string
  number: number
  status: InvoiceStatus
  client_name: string
  client_email: string | null
  po_number: string | null
  line_items: InvoiceLineItem[]
  currency: string
  notes: string | null
  issued_at: number
  due_at: number
  created: number
  paid_at: number | null
}

export interface NewInvoiceBody {
  client_name: string
  client_email?: string
  po_number?: string
  line_items: InvoiceLineItem[]
  currency?: string
  notes?: string
  due_in_days?: number
}

export function lineItemsTotal(items: InvoiceLineItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.quantity * item.unit_amount_cents,
    0,
  )
}

// The session is an HttpOnly cookie, sent automatically on same-origin requests.
async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (res.status === 401 || res.status === 403 || res.status === 503) {
    throw new AuthError()
  }
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`)
  return res
}

export async function listInvoices(): Promise<Invoice[]> {
  return (await adminFetch('/invoices')).json()
}

export async function createInvoice(body: NewInvoiceBody): Promise<Invoice> {
  return (
    await adminFetch('/invoices', { method: 'POST', body: JSON.stringify(body) })
  ).json()
}

export async function setInvoiceStatus(
  id: string,
  status: InvoiceStatus,
): Promise<Invoice> {
  return (
    await adminFetch(`/invoices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  ).json()
}

// Merchant profile shown on invoices — admin-editable, not a deploy env var.
export interface Settings {
  business_name: string | null
  remit_to: string | null
}

export async function fetchSettings(): Promise<Settings> {
  return (await adminFetch('/settings')).json()
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  return (
    await adminFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  ).json()
}

export interface Me {
  login: string
}

export async function fetchMe(): Promise<Me> {
  return (await adminFetch('/auth/me')).json()
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' })
}
