import { readPreferences, savePreferences } from "@/server/preferences";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
const key = ["studio-preferences"] as const;
export const preferenceOptions = () =>
  queryOptions({
    queryKey: key,
    queryFn: () => readPreferences(),
    staleTime: Infinity,
  });
export const preferenceMutation = (client: QueryClient) => ({
  mutationKey: key,
  mutationFn: (theme: "light" | "dark" | "system") =>
    savePreferences({ data: { theme } }),
  onSuccess: (data: Awaited<ReturnType<typeof readPreferences>>) =>
    client.setQueryData(key, data),
});
