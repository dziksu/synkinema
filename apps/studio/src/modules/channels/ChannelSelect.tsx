import { reads } from "@/api/queries";
import { NativeSelect } from "@/components/ui/native-select";
import { tr } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function ChannelSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const query = useQuery(reads.channels(client));
  return (
    <label className="field">
      {tr("Editorial channel")}
      <NativeSelect
        value={value}
        disabled={disabled || query.isPending || query.isError}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{tr("Independent project (no channel)")}</option>
        {(query.data || [])
          .filter((c) => !c.archived || c.id === value)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.archived ? ` · ${tr("Archived")}` : ""}
            </option>
          ))}
      </NativeSelect>
      {query.error && <span role="alert">{query.error.message}</span>}
    </label>
  );
}
