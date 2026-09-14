import type { ChangeEvent } from "react";
import { Camera, Check, Plus, QrCode, Trash2 } from "lucide-react";
import {
  INCIDENT_REASONS,
  type IncidentItem,
  type IncidentReason,
} from "./incidentReport";

interface IncidentItemsEditorProps {
  items: readonly IncidentItem[];
  code: string;
  selectedReasons: readonly IncidentReason[];
  decodingImage: boolean;
  onCodeChange: (value: string) => void;
  onReasonChange: (reason: IncidentReason) => void;
  onAdd: () => void;
  onToggleItemReason: (id: string, reason: IncidentReason) => void;
  onRemove: (id: string) => void;
  onOpenScanner: () => void;
  onCaptureImage: (event: ChangeEvent<HTMLInputElement>) => void;
}

interface ReasonToggleProps {
  selected: boolean;
  label: IncidentReason;
  onClick: () => void;
}

const ReasonToggle = ({ selected, label, onClick }: ReasonToggleProps) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`btn btn-sm min-h-11 justify-start ${
      selected ? "btn-primary" : "btn-outline"
    }`}
  >
    {selected ? <Check className="h-3.5 w-3.5" /> : null}
    {label}
  </button>
);

export function IncidentItemsEditor({
  items,
  code,
  selectedReasons,
  decodingImage,
  onCodeChange,
  onReasonChange,
  onAdd,
  onToggleItemReason,
  onRemove,
  onOpenScanner,
  onCaptureImage,
}: IncidentItemsEditorProps) {
  return (
    <section className="space-y-4">
      <form
        className="app-surface space-y-4 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <div>
          <h3 className="font-black">Quét hoặc nhập kiện bổ sung</h3>
          <p className="mt-1 text-sm text-base-content/60">
            Nếu mã đã có, các loại sự vụ mới sẽ được cộng vào cùng một dòng.
          </p>
        </div>
        <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <label className="grid gap-1.5 text-sm font-bold">
            Mã SPX hoặc TO
            <input
              value={code}
              onChange={(event) => onCodeChange(event.target.value.toUpperCase())}
              className="input input-bordered min-h-11 w-full font-mono text-base uppercase"
              placeholder="Quét hoặc nhập mã kiện"
            />
          </label>
          <button
            type="button"
            className="btn min-h-11 gap-2"
            onClick={onOpenScanner}
          >
            <QrCode className="h-4 w-4" /> Quét mã
          </button>
          <label
            className={`btn min-h-11 gap-2 ${decodingImage ? "btn-disabled" : "cursor-pointer"}`}
          >
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={decodingImage}
              onChange={onCaptureImage}
            />
            {decodingImage ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {decodingImage ? "Đang đọc" : "Chụp ảnh"}
          </label>
          <button
            type="submit"
            className="btn btn-primary min-h-11 gap-2"
          >
            <Plus className="h-4 w-4" /> Thêm / cập nhật
          </button>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Loại sự vụ</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {INCIDENT_REASONS.map((reason) => (
              <ReasonToggle
                key={reason}
                label={reason}
                selected={selectedReasons.includes(reason)}
                onClick={() => onReasonChange(reason)}
              />
            ))}
          </div>
        </fieldset>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h3 className="font-black">Danh sách sự vụ</h3>
        <span className="badge badge-primary badge-outline">
          {items.length} mã
        </span>
      </div>

      {items.length === 0 ? (
        <div className="app-surface p-8 text-center text-sm text-base-content/60">
          Chưa có mã sự vụ. Danh sách Thiếu và Dư sẽ tự xuất hiện sau khi API
          tải xong.
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {items.map((item, index) => (
              <article
                key={item.id}
                className="app-surface p-4"
                style={{ contentVisibility: "auto", containIntrinsicSize: "220px" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs text-base-content/50">
                      #{index + 1} · {item.sources.includes("auto") ? "Tự động" : "Thủ công"}
                    </span>
                    <p className="break-all font-mono font-bold text-primary">
                      {item.code}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-circle min-h-11 min-w-11 text-error"
                    onClick={() => onRemove(item.id)}
                    aria-label={`Xóa ${item.code}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {INCIDENT_REASONS.map((reason) => (
                    <ReasonToggle
                      key={reason}
                      label={reason}
                      selected={item.reasons.includes(reason)}
                      onClick={() => onToggleItemReason(item.id, reason)}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="app-surface hidden overflow-x-auto md:block">
            <table className="table table-sm min-w-[64rem]">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>SPX/TO</th>
                  {INCIDENT_REASONS.map((reason) => (
                    <th key={reason} className="text-center">
                      {reason}
                    </th>
                  ))}
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td className="font-mono font-bold text-primary">
                      {item.code}
                    </td>
                    {INCIDENT_REASONS.map((reason) => (
                      <td key={reason} className="text-center">
                        <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            aria-label={`${item.code}: ${reason}`}
                            checked={item.reasons.includes(reason)}
                            onChange={() => onToggleItemReason(item.id, reason)}
                          />
                        </label>
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-circle min-h-11 min-w-11 text-error"
                        onClick={() => onRemove(item.id)}
                        aria-label={`Xóa ${item.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
