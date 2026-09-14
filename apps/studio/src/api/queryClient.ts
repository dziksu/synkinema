import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./transport";
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15000,
        gcTime: 5 * 60000,
        refetchOnWindowFocus: true,
        retry: (count, error) =>
          !(error instanceof ApiRequestError && error.status < 500) &&
          count < 1,
      },
      mutations: { retry: false },
    },
  });
}
