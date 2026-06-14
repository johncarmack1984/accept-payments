import { useEffect, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  fetchInvoice,
  formatDate,
  money,
  type InvoiceStatus,
  type PublicInvoice,
} from '@/lib/api'

type Search = { demo?: InvoiceStatus }

export const Route = createFileRoute('/i/$token')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    demo:
      search.demo === 'open' || search.demo === 'paid' ? search.demo : undefined,
  }),
  component: InvoicePage,
})

type State =
  | { status: 'loading' }
  | { status: 'ready'; invoice: PublicInvoice }
  | { status: 'error'; message: string }

// Dev-only: /i/<anything>?demo=open|paid renders a sample without a live backend.
function demoInvoice(status: InvoiceStatus): PublicInvoice {
  return {
    number: 7,
    status,
    client_name: 'Acme Corp',
    po_number: 'PO-4421',
    line_items: [
      { description: 'Engineering — June', quantity: 40, unit_amount_cents: 22_500 },
      { description: 'On-call retainer', quantity: 1, unit_amount_cents: 150_000 },
    ],
    currency: 'usd',
    total: 40 * 22_500 + 150_000,
    issued_at: 1_765_000_000,
    due_at: 1_765_000_000 + 30 * 86_400,
    paid_at: status === 'paid' ? 1_765_500_000 : null,
    business_name: 'John Carmack',
    remit_to:
      'ACH — routing 000000000 · account 0000000000\nWire — SWIFT XXXXX0000 · account 0000000000\nCheck — 123 Main St, Anytown',
  }
}

function InvoicePage() {
  const { token } = Route.useParams()
  const { demo } = Route.useSearch()
  const [state, setState] = useState<State>(
    demo ? { status: 'ready', invoice: demoInvoice(demo) } : { status: 'loading' },
  )

  useEffect(() => {
    if (demo) {
      setState({ status: 'ready', invoice: demoInvoice(demo) })
      return
    }
    let active = true
    setState({ status: 'loading' })
    fetchInvoice(token)
      .then((invoice) => {
        if (active) setState({ status: 'ready', invoice })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message:
              error instanceof Error ? error.message : 'Something went wrong.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [token, demo])

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-4 sm:p-6">
      {state.status === 'loading' ? <InvoiceSkeleton /> : null}
      {state.status === 'ready' ? <InvoiceView invoice={state.invoice} /> : null}
      {state.status === 'error' ? (
        <Alert variant="destructive" className="max-w-md">
          <TriangleAlert />
          <AlertTitle>Invoice unavailable</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </main>
  )
}

const STATUS: Record<
  InvoiceStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  open: { label: 'Open', variant: 'outline' },
  paid: { label: 'Paid', variant: 'default' },
  void: { label: 'Void', variant: 'secondary' },
}

function InvoiceView({ invoice }: { invoice: PublicInvoice }) {
  const status = STATUS[invoice.status]
  return (
    <Card className="w-full max-w-2xl">
      <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Invoice
            </h1>
            <p className="text-sm text-muted-foreground">
              INV-{String(invoice.number).padStart(4, '0')}
            </p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Field label="From">{invoice.business_name ?? '—'}</Field>
          <Field label="Bill to">
            {invoice.client_name}
            {invoice.po_number ? (
              <div className="font-normal text-muted-foreground">
                PO {invoice.po_number}
              </div>
            ) : null}
          </Field>
          <Field label="Issued / due">
            {formatDate(invoice.issued_at)}
            <div className="font-normal text-muted-foreground">
              due {formatDate(invoice.due_at)}
            </div>
          </Field>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.line_items.map((item, index) => (
              <TableRow key={index}>
                <TableCell className="whitespace-normal">
                  {item.description}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.quantity}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(item.unit_amount_cents, invoice.currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(item.quantity * item.unit_amount_cents, invoice.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-baseline justify-between border-t pt-4">
          <span className="text-sm text-muted-foreground">
            {invoice.status === 'paid' ? 'Paid in full' : 'Total due'}
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {money(invoice.total, invoice.currency)}
          </span>
        </div>

        {invoice.status === 'paid' ? (
          <p className="text-sm text-muted-foreground">
            Paid{invoice.paid_at ? ` on ${formatDate(invoice.paid_at)}` : ''}. Thank
            you.
          </p>
        ) : invoice.status === 'void' ? (
          <p className="text-sm text-muted-foreground">
            This invoice has been voided.
          </p>
        ) : invoice.remit_to ? (
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="mb-1 text-sm font-medium">How to pay</p>
            <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
              {invoice.remit_to}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground/70">
        {label}
      </div>
      <div className="mt-0.5 font-medium">{children}</div>
    </div>
  )
}

function InvoiceSkeleton() {
  return (
    <Card className="w-full max-w-2xl">
      <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-8 w-48 self-end" />
      </CardContent>
    </Card>
  )
}
