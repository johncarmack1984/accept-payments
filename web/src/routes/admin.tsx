import { createFileRoute } from "@tanstack/react-router"

import { AdminPage } from "./-admin"

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: AdminPage,
})
