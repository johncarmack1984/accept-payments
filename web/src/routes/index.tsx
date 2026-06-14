import { createFileRoute, Link } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            accept-payments
          </h1>
          <p className="text-sm text-muted-foreground">
            Checkout receipt — preview the states
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/success"
            search={{ session_id: '', demo: 'paid' }}
            className={cn(buttonVariants({ variant: 'default', size: 'lg' }))}
          >
            Card receipt
          </Link>
          <Link
            to="/success"
            search={{ session_id: '', demo: 'unpaid' }}
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
          >
            ACH receipt
          </Link>
        </div>
      </div>
    </main>
  )
}
