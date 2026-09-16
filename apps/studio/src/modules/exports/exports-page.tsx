import { reads } from "@/api/queries";
import PageHeader from "@/components/PageHeader";
import { ErrorState, LoadingState } from "@/components/query-state";
import { tr } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import RenderQueue from "./RenderQueue";
export function ExportsPage() {
  const client = useQueryClient(),
    jobs = useQuery(reads.jobs(client));
  return (
    <>
      <PageHeader
        eyebrow={tr("Delivery workspace")}
        title={tr("From timeline to finished video.")}
        description={tr(
          "Track progress, review output, and manage your exports in one place.",
        )}
      />
      {jobs.error ? (
        <ErrorState error={jobs.error} retry={() => void jobs.refetch()} />
      ) : jobs.isPending ? (
        <LoadingState />
      ) : (
        <RenderQueue jobs={jobs.data} />
      )}
    </>
  );
}
