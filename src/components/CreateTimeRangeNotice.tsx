import { Clock3 } from "lucide-react";
import type { CreateTimeRange } from "../utils/createTimeRange";

interface CreateTimeRangeNoticeProps {
  range: CreateTimeRange | null;
}

const formatLocalDateTime = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;

  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year} ${hour}:${minute}`;
};

export const CreateTimeRangeNotice = ({ range }: CreateTimeRangeNoticeProps) => {
  if (!range) return null;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-base-200 bg-base-200/35 px-3 py-2 text-xs text-base-content/65">
      <Clock3 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="shrink-0 font-semibold text-base-content/70">
        Create Time TO đóng bao:
      </span>
      <span className="min-w-0 break-words font-mono font-semibold text-base-content/80">
        {formatLocalDateTime(range.fromLocalDateTime)} → {formatLocalDateTime(range.toLocalDateTime)}
      </span>
    </div>
  );
};
