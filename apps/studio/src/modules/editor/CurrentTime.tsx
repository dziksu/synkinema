import { useStudio } from "@/modules/editor/store";

import { timecode } from "@/lib/time";
export default function CurrentTime() {
  const time = useStudio((s) => Math.floor(s.time / 100) * 100);
  return <>{timecode(time)}</>;
}
