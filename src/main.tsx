import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { router } from "./router";

const root = document.getElementById("root");
if (!root) {
  throw new Error("ChartStead root element is missing");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30_000 },
  },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
