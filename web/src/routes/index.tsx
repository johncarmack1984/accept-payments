import { createFileRoute, Link } from '@tanstack/react-router'
import { CreditCard, Landmark } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <Badge variant="secondary">Rust · Lambda · Stripe</Badge>
        <div className="space-y-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
            accept-payments
          </h1>
          <p className="text-balance text-muted-foreground">
            Card and ACH bank checkout on a single AWS Lambda — no servers, no
            framework, $0 to run.
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <CreditCard className="size-4" /> Cards
          </span>
          <span className="flex items-center gap-2">
            <Landmark className="size-4" /> ACH bank debit
          </span>
        </div>
        {import.meta.env.DEV ? (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Link
              to="/success"
              search={{ session_id: '', demo: 'paid' }}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Receipt · paid
            </Link>
            <Link
              to="/success"
              search={{ session_id: '', demo: 'unpaid' }}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Receipt · ACH
            </Link>
            <Link
              to="/cancel"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Cancel
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  )
}
