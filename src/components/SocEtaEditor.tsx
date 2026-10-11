import { useMemo, useState } from "react";
import { Clock3, Search } from "lucide-react";
import type { StationCatalogSoc } from "../utils/stationCatalog";

interface SocEtaEditorProps {
  sourceSoc?: StationCatalogSoc;
  options: readonly StationCatalogSoc[];
  values: Record<string, number>;
  disabled?: boolean;
  onChange: (values: Record<string, number>) => void;
}

const normalizeSearch = (value: string): string =>
  value.trim().toLocaleLowerCase("vi-VN");

const clampInteger = (
  value: string,
  min: number,
  max: number,
): number => {
  if (!value.trim()) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(max, Math.max(min, parsed));
};

export const SocEtaEditor = ({
  sourceSoc,
  options,
  values,
  disabled = false,
  onChange,
}: SocEtaEditorProps) => {
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return [...options];

    return options.filter(({ stationName, stationCode, id }) =>
      [stationName, stationCode, id].some((value) =>
        normalizeSearch(value).includes(query),
      ),
    );
  }, [options, search]);

  const configuredCount = Object.values(values).filter(
    (minutes) => Number.isFinite(minutes) && minutes > 0,
  ).length;

  const updateDuration = (
    destinationName: string,
    nextHours: number,
    nextMinutes: number,
  ) => {
    const totalMinutes =
      Math.max(0, nextHours) * 60 + Math.max(0, nextMinutes);
    const next = { ...values };

    if (totalMinutes > 0) {
      next[destinationName] = Math.min(72 * 60, totalMinutes);
    } else {
      delete next[destinationName];
    }

    onChange(next);
  };

  if (!sourceSoc) {
    return (
      <p className="rounded-xl border border-dashed border-base-300 p-4 text-center text-sm text-base-content/55">
        Chọn SOC hiện tại để cấu hình ETA đến các SOC khác.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-base-200/55 p-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0 text-sm">
            <strong>{sourceSoc.stationName}</strong>
            <span className="text-base-content/55">
              {" "}→ SOC khác · {configuredCount}/{options.length} tuyến đã cấu hình
            </span>
          </p>
        </div>
      </div>

      <label className="input input-bordered flex min-h-11 items-center gap-2 rounded-xl">
        <Search className="h-4 w-4 shrink-0 text-base-content/45" aria-hidden="true" />
        <input
          type="search"
          value={search}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm tên SOC, mã SOC hoặc Station ID"
          className="grow"
          aria-label="Tìm SOC để cấu hình ETA"
        />
      </label>

      <div className="max-h-[520px] overflow-y-auto rounded-xl border border-base-300">
        {filteredOptions.length > 0 ? (
          <div className="divide-y divide-base-200">
            {filteredOptions.map((destination) => {
              const totalMinutes = values[destination.stationName] || 0;
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;

              return (
                <div
                  key={destination.id}
                  className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {destination.stationName}
                    </p>
                    <p className="mt-0.5 text-xs text-base-content/50">
                      {destination.stationCode} · ID {destination.id}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="form-control">
                      <span className="mb-1 text-[11px] font-semibold text-base-content/50">
                        Giờ
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={72}
                        step={1}
                        value={totalMinutes > 0 ? hours : ""}
                        disabled={disabled}
                        onChange={(event) =>
                          updateDuration(
                            destination.stationName,
                            clampInteger(event.target.value, 0, 72),
                            minutes,
                          )
                        }
                        className="input input-bordered input-sm min-h-10 rounded-lg text-center tabular-nums"
                        aria-label={"Số giờ từ " + sourceSoc.stationName + " đến " + destination.stationName}
                      />
                    </label>

                    <label className="form-control">
                      <span className="mb-1 text-[11px] font-semibold text-base-content/50">
                        Phút
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        step={1}
                        value={totalMinutes > 0 ? minutes : ""}
                        disabled={disabled}
                        onChange={(event) =>
                          updateDuration(
                            destination.stationName,
                            hours,
                            clampInteger(event.target.value, 0, 59),
                          )
                        }
                        className="input input-bordered input-sm min-h-10 rounded-lg text-center tabular-nums"
                        aria-label={"Số phút từ " + sourceSoc.stationName + " đến " + destination.stationName}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="p-5 text-center text-sm text-base-content/55">
            Không tìm thấy SOC phù hợp.
          </p>
        )}
      </div>

      <p className="text-xs leading-relaxed text-base-content/55">
        Check xe ưu tiên ETA tuyến trong Cài đặt OPS FTE trước cấu hình Sheet và
        dữ liệu lịch sử. Với SOC hiện tại là Pleiku, thời lượng Pleiku → SOC khác
        được dùng làm thời lượng chuẩn của cặp tuyến khi dự báo xe về Pleiku.
      </p>
    </div>
  );
};
