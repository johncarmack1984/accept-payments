import type { ComponentType } from 'react'
import { CheckCircle2, Clock3, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatAmount, type PaymentStatus, type SessionStatus } from '@/lib/api'

type Variant = {
  icon: ComponentType<{ className?: string }>
  iconClass: string
  heading: string
  badge: string
  badgeVariant: 'default' | 'secondary'
  message: string
}

const VARIANTS: Record<PaymentStatus, Variant> = {
  // Cards settle inside the session.
  paid: {
    icon: CheckCircle2,
    iconClass:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    heading: 'Payment received',
    badge: 'Paid',
    badgeVariant: 'default',
    message: 'Thank you — your payment is complete.',
  },
  // ACH debits land unpaid and settle days later.
  unpaid: {
    icon: Clock3,
    iconClass:
      'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    heading: 'Payment processing',
    badge: 'Processing',
    badgeVariant: 'secondary',
    message:
      'Your bank transfer has been initiated. ACH payments take 1–3 business days to settle.',
  },
  no_payment_required: {
    icon: CheckCircle2,
    iconClass: 'bg-muted text-muted-foreground',
    heading: 'All set',
    badge: 'Complete',
    badgeVariant: 'secondary',
    message: 'No payment was required.',
  },
}

export function Receipt({ session }: { session: SessionStatus }) {
  const variant = VARIANTS[session.payment_status] ?? VARIANTS.no_payment_required
  const Icon = variant.icon
  const amount = formatAmount(session.amount_total, session.currency)

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col items-center gap-4 px-8 py-4 text-center">
        <div
          className={cn(
            'flex size-16 items-center justify-center rounded-full',
            variant.iconClass,
          )}
        >
          <Icon className="size-8" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            {variant.heading}
          </h1>
          <Badge variant={variant.badgeVariant}>{variant.badge}</Badge>
        </div>
        {amount ? (
          <p className="text-3xl font-semibold tabular-nums">{amount}</p>
        ) : null}
        <p className="text-sm text-balance text-muted-foreground">
          {variant.message}
        </p>
        <p className="max-w-full truncate font-mono text-xs text-muted-foreground/60">
          {session.id}
        </p>
      </CardContent>
    </Card>
  )
}

export function ReceiptSkeleton() {
  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col items-center gap-4 px-8 py-4">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-3 w-48" />
      </CardContent>
    </Card>
  )
}

export function ReceiptError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="max-w-sm">
      <TriangleAlert />
      <AlertTitle>We couldn&apos;t load your receipt</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
