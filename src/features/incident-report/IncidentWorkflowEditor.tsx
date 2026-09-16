import { ClipboardCheck, UserRound } from "lucide-react";
import {
  INCIDENT_REASONS,
  INCIDENT_STATUSES,
  type IncidentItem,
  type IncidentStatus,
} from "./incidentReport";

interface IncidentWorkflowEditorProps {
  incidentId: string;
  status: IncidentStatus;
  description: string;
  actionTaken: string;
  owner: string;
  items: readonly IncidentItem[];
  onStatusChange: (value: IncidentStatus) => void;
  onDescriptionChange: (value: string) => void;
  onActionTakenChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
}

export function IncidentWorkflowEditor({
  incidentId,
  status,
  description,
  actionTaken,
  owner,
  items,
  onStatusChange,
  onDescriptionChange,
  onActionTakenChange,
  onOwnerChange,
}: IncidentWorkflowEditorProps) {
  const totals = INCIDENT_REASONS.map((reason) => ({
    reason,
    count: items.filter((item) => item.reasons.includes(reason)).length,
  })).filter((item) => item.count > 0);

  return (
    <section className="app-surface space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="font-black">Xử lý sự vụ</h3>
          </div>
          <p className="mt-1 text-sm text-base-content/60">
            Bổ sung bối cảnh và hướng xử lý để biên bản có thể theo dõi tiếp sau khi lập.
          </p>
        </div>
        <span className="badge badge-primary badge-outline h-auto min-h-7 break-all px-3 py-1 font-mono text-xs font-bold">
          {incidentId || "Chưa tạo mã sự vụ"}
        </span>
      </div>

      {totals.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Tóm tắt loại sự vụ">
          {totals.map(({ reason, count }) => (
            <span key={reason} className="badge badge-neutral badge-outline gap-1">
              {reason} <strong>{count}</strong>
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-bold">
          Trạng thái
          <select
            value={status}
            onChange={(event) =>
              onStatusChange(event.target.value as IncidentStatus)
            }
            className="select select-bordered min-h-11 w-full"
          >
            {INCIDENT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-bold">
          Người phụ trách
          <span className="input input-bordered flex min-h-11 items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 text-base-content/50" aria-hidden="true" />
            <input
              value={owner}
              onChange={(event) => onOwnerChange(event.target.value)}
              className="min-w-0 grow"
              placeholder="Tên hoặc email PIC"
              maxLength={160}
            />
          </span>
        </label>
      </div>

      <label className="grid gap-1.5 text-sm font-bold">
        Mô tả sự vụ
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          className="textarea textarea-bordered min-h-28 w-full leading-relaxed"
          placeholder="Mô tả ngắn gọn sự việc, thời điểm phát hiện và ảnh hưởng..."
          maxLength={2000}
        />
      </label>

      <label className="grid gap-1.5 text-sm font-bold">
        Hướng xử lý / hành động đã thực hiện
        <textarea
          value={actionTaken}
          onChange={(event) => onActionTakenChange(event.target.value)}
          className="textarea textarea-bordered min-h-28 w-full leading-relaxed"
          placeholder="Đã đối soát, liên hệ SOC nguồn, kiểm tra camera, bàn giao cho PIC..."
          maxLength={2000}
        />
      </label>

      {items.some((item) => item.reasons.includes("Khác")) && !description.trim() ? (
        <div className="alert alert-warning text-sm" role="alert">
          Có sự vụ “Khác”. Hãy nhập mô tả trước khi xem trước biên bản.
        </div>
      ) : null}
    </section>
  );
}
