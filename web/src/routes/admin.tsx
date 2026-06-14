import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, Check, Copy, Plus, Settings as SettingsIcon, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  AuthError,
  clearAdminToken,
  createInvoice,
  fetchSettings,
  formatDate,
  getAdminToken,
  lineItemsTotal,
  listInvoices,
  money,
  saveSettings,
  setAdminToken,
  setInvoiceStatus,
  type Invoice,
  type InvoiceStatus,
  type NewInvoiceBody,
} from '@/lib/api'

export const Route = createFileRoute('/admin')({ component: AdminPage })

function AdminPage() {
  const [hasToken, setHasToken] = useState(() => getAdminToken() !== '')
  const [gateError, setGateError] = useState<string>()

  const signOut = useCallback((message?: string) => {
    clearAdminToken()
    setGateError(message)
    setHasToken(false)
  }, [])

  if (!hasToken) {
    return (
      <TokenGate
        error={gateError}
        onSubmit={(token) => {
          setAdminToken(token)
          setGateError(undefined)
          setHasToken(true)
        }}
      />
    )
  }
  return (
    <Dashboard
      onAuthError={() => signOut('That token was rejected.')}
      onSignOut={() => signOut()}
    />
  )
}

function TokenGate({
  error,
  onSubmit,
}: {
  error?: string
  onSubmit: (token: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="space-y-1">
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              Admin
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your admin token to continue.
            </p>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (value.trim()) onSubmit(value.trim())
            }}
          >
            <Input
              type="password"
              autoFocus
              placeholder="ADMIN_TOKEN"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={!value.trim()}>
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}

const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'secondary' | 'outline'> =
  {
    open: 'outline',
    paid: 'default',
    void: 'secondary',
  }

function Dashboard({
  onAuthError,
  onSignOut,
}: {
  onAuthError: () => void
  onSignOut: () => void
}) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [error, setError] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [editingSettings, setEditingSettings] = useState(false)

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof AuthError) onAuthError()
      else setError(err instanceof Error ? err.message : 'Something went wrong.')
    },
    [onAuthError],
  )

  const load = useCallback(() => {
    setError(undefined)
    listInvoices().then(setInvoices).catch(handleError)
  }, [handleError])

  useEffect(() => {
    load()
  }, [load])

  async function changeStatus(id: string, status: InvoiceStatus) {
    try {
      await setInvoiceStatus(id, status)
      load()
    } catch (err) {
      handleError(err)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Invoices
        </h1>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreating((open) => !open)}>
            <Plus /> New invoice
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingSettings((open) => !open)}
          >
            <SettingsIcon /> Settings
          </Button>
          <Button size="sm" variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>

      {editingSettings ? (
        <SettingsForm
          onCancel={() => setEditingSettings(false)}
          onSaved={() => setEditingSettings(false)}
          onError={handleError}
        />
      ) : null}

      {creating ? (
        <CreateInvoiceForm
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            load()
          }}
          onError={handleError}
        />
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices === null ? (
                <Empty>Loading…</Empty>
              ) : invoices.length === 0 ? (
                <Empty>No invoices yet.</Empty>
              ) : (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="tabular-nums">
                      INV-{String(invoice.number).padStart(4, '0')}
                    </TableCell>
                    <TableCell>{invoice.client_name}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[invoice.status]}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(lineItemsTotal(invoice.line_items), invoice.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(invoice.due_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Copy public link"
                          onClick={() =>
                            navigator.clipboard.writeText(
                              `${location.origin}/i/${invoice.id}`,
                            )
                          }
                        >
                          <Copy />
                        </Button>
                        {invoice.status === 'open' ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => changeStatus(invoice.id, 'paid')}
                          >
                            <Check /> Paid
                          </Button>
                        ) : null}
                        {invoice.status !== 'void' ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => changeStatus(invoice.id, 'void')}
                          >
                            <Ban /> Void
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  )
}

type Row = { description: string; quantity: string; unit: string }

const emptyRow = (): Row => ({ description: '', quantity: '1', unit: '' })

function CreateInvoiceForm({
  onCreated,
  onCancel,
  onError,
}: {
  onCreated: () => void
  onCancel: () => void
  onError: (err: unknown) => void
}) {
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [dueDays, setDueDays] = useState('30')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [submitting, setSubmitting] = useState(false)

  const total = rows.reduce(
    (sum, row) =>
      sum + (Number(row.quantity) || 0) * Math.round((Number(row.unit) || 0) * 100),
    0,
  )

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function submit() {
    const line_items = rows
      .filter((row) => row.description.trim())
      .map((row) => ({
        description: row.description.trim(),
        quantity: Number(row.quantity) || 1,
        unit_amount_cents: Math.round((Number(row.unit) || 0) * 100),
      }))
    if (!clientName.trim() || line_items.length === 0) {
      onError(new Error('A client and at least one line item are required.'))
      return
    }

    const body: NewInvoiceBody = {
      client_name: clientName.trim(),
      client_email: clientEmail.trim() || undefined,
      po_number: poNumber.trim() || undefined,
      due_in_days: Number(dueDays) || 30,
      notes: notes.trim() || undefined,
      line_items,
    }
    setSubmitting(true)
    try {
      await createInvoice(body)
      onCreated()
    } catch (err) {
      onError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Client name">
              <Input
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Client email">
              <Input
                type="email"
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
              />
            </FormField>
            <FormField label="PO number">
              <Input
                value={poNumber}
                onChange={(event) => setPoNumber(event.target.value)}
              />
            </FormField>
            <FormField label="Due in days">
              <Input
                type="number"
                min="0"
                value={dueDays}
                onChange={(event) => setDueDays(event.target.value)}
              />
            </FormField>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Line items</Label>
            {rows.map((row, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder="Description"
                  value={row.description}
                  onChange={(event) =>
                    updateRow(index, { description: event.target.value })
                  }
                />
                <Input
                  className="w-16"
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(event) =>
                    updateRow(index, { quantity: event.target.value })
                  }
                />
                <Input
                  className="w-24"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit $"
                  value={row.unit}
                  onChange={(event) =>
                    updateRow(index, { unit: event.target.value })
                  }
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove line"
                  onClick={() =>
                    setRows((rs) =>
                      rs.length > 1 ? rs.filter((_, i) => i !== index) : rs,
                    )
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => setRows((rs) => [...rs, emptyRow()])}
            >
              <Plus /> Add line
            </Button>
          </div>

          <FormField label="Notes">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </FormField>

          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">
              Total{' '}
              <span className="font-medium text-foreground tabular-nums">
                {money(total, 'usd')}
              </span>
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create invoice'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function SettingsForm({
  onSaved,
  onCancel,
  onError,
}: {
  onSaved: () => void
  onCancel: () => void
  onError: (err: unknown) => void
}) {
  const [businessName, setBusinessName] = useState('')
  const [remitTo, setRemitTo] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    fetchSettings()
      .then((settings) => {
        if (active) {
          setBusinessName(settings.business_name ?? '')
          setRemitTo(settings.remit_to ?? '')
          setLoaded(true)
        }
      })
      .catch((err) => {
        if (active) onError(err)
      })
    return () => {
      active = false
    }
  }, [onError])

  async function save() {
    setSaving(true)
    try {
      await saveSettings({
        business_name: businessName.trim() || null,
        remit_to: remitTo.trim() || null,
      })
      onSaved()
    } catch (err) {
      onError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <FormField label="Business name">
            <Input
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="Your name or LLC"
            />
          </FormField>
          <FormField label="How clients pay you — shown on every invoice">
            <Textarea
              rows={4}
              value={remitTo}
              onChange={(event) => setRemitTo(event.target.value)}
              placeholder={'ACH — routing … · account …\nWire — …\nCheck — …'}
            />
          </FormField>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!loaded || saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
