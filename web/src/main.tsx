import { StrictMode } from "react"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { createRoot } from "react-dom/client"

import "./index.css"
import { routeTree } from "./routeTree.gen"

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")
if (!root) {
  throw new Error("missing #root element")
}
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
