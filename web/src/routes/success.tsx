import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { Receipt, ReceiptError, ReceiptSkeleton } from '@/components/receipt'
import {
  fetchSession,
  isPaymentStatus,
  type PaymentStatus,
  type SessionStatus,
} from '@/lib/api'

type SuccessSearch = {
  session_id: string
  demo?: PaymentStatus
}

export const Route = createFileRoute('/success')({
  validateSearch: (search: Record<string, unknown>): SuccessSearch => ({
    session_id: typeof search.session_id === 'string' ? search.session_id : '',
    demo: isPaymentStatus(search.demo) ? search.demo : undefined,
  }),
  component: SuccessPage,
})

type State =
  | { status: 'loading' }
  | { status: 'ready'; session: SessionStatus }
  | { status: 'error'; message: string }

// Dev-only: /success?demo=paid|unpaid renders a state without a live backend.
function demoSession(status: PaymentStatus): SessionStatus {
  return {
    id: 'cs_test_demo_a1B2c3D4e5F6g7H8',
    payment_status: status,
    amount_total: 1000,
    currency: 'usd',
  }
}

function SuccessPage() {
  const { session_id, demo } = Route.useSearch()
  const [state, setState] = useState<State>(
    demo ? { status: 'ready', session: demoSession(demo) } : { status: 'loading' },
  )

  useEffect(() => {
    if (demo) {
      setState({ status: 'ready', session: demoSession(demo) })
      return
    }
    if (!session_id) {
      setState({ status: 'error', message: 'No session id in the URL.' })
      return
    }

    let active = true
    setState({ status: 'loading' })
    fetchSession(session_id)
      .then((session) => {
        if (active) setState({ status: 'ready', session })
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
  }, [session_id, demo])

  return (
    <main className="grid min-h-svh place-items-center p-6">
      {state.status === 'loading' ? <ReceiptSkeleton /> : null}
      {state.status === 'ready' ? <Receipt session={state.session} /> : null}
      {state.status === 'error' ? <ReceiptError message={state.message} /> : null}
    </main>
  )
}
