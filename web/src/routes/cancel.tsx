import { createFileRoute, Link } from '@tanstack/react-router'
import { XCircle } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/cancel')({
  component: CancelPage,
})

function CancelPage() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 px-8 py-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <XCircle className="size-8" />
          </div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            Checkout canceled
          </h1>
          <p className="text-balance text-sm text-muted-foreground">
            No payment was taken. Head back whenever you're ready to try again.
          </p>
          <Link to="/" className={cn(buttonVariants({ variant: 'outline' }))}>
            Back to home
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
