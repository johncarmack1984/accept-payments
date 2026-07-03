import { createFileRoute } from "@tanstack/react-router"

import type { InvoiceStatus } from "@/lib/api"

import { InvoicePage } from "./-invoice-page"

type Search = { demo?: InvoiceStatus }

export const Route = createFileRoute("/i/$token")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    demo:
      search.demo === "open" || search.demo === "paid"
        ? search.demo
        : undefined,
  }),
  component: InvoicePage,
})
