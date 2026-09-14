import type { ChangeEvent } from "react";
import { CalendarDays, Camera, QrCode, Search, Truck } from "lucide-react";
import type { TripSummary } from "./incidentReport";

interface TripSearchPanelProps {
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  decodingImage: boolean;
  error: string;
  results: readonly TripSummary[];
  onSearch: () => void;
  onSelect: (trip: TripSummary) => void;
  onOpenScanner: () => void;
  onCaptureImage: (event: ChangeEvent<HTMLInputElement>) => void;
}

const formatTripDate = (seconds: number) =>
  seconds > 0
    ? new Date(seconds * 1000).toLocaleString("vi-VN")
    : "Chưa có ngày chạy";

export function TripSearchPanel({
  query,
  onQueryChange,
  loading,
  decodingImage,
  error,
  results,
  onSearch,
  onSelect,
  onOpenScanner,
  onCaptureImage,
}: TripSearchPanelProps) {
  return (
    <section className="app-surface space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-base font-black">Tìm chuyến Linehaul</h2>
        <p className="mt-1 text-sm text-base-content/60">
          Nhập mã LH Trip hoặc biển số xe. Nếu có nhiều chuyến, hãy chọn đúng
          chuyến cần lập biên bản.
        </p>
      </div>

      <form
        className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <label className="grid gap-1.5 text-sm font-bold">
          LH Trip hoặc biển số xe
          <input
            autoFocus
            className="input input-bordered min-h-11 w-full font-mono text-base uppercase"
            value={query}
            onChange={(event) => onQueryChange(event.target.value.toUpperCase())}
            placeholder="Ví dụ: LT0Q... hoặc 29E-259.57"
          />
        </label>
        <button
          type="button"
          className="btn min-h-11 gap-2"
          onClick={onOpenScanner}
        >
          <QrCode className="h-4 w-4" /> Quét
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
          disabled={loading}
        >
          {loading ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Tìm chuyến
        </button>
      </form>

      {error ? (
        <div className="alert alert-error text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {results.length > 1 ? (
        <div className="grid gap-3" aria-label="Chọn LH Trip">
          <p className="text-sm font-bold">
            Tìm thấy {results.length} chuyến. Chọn đúng chuyến:
          </p>
          {results.map((trip) => (
            <button
              key={trip.id}
              type="button"
              onClick={() => onSelect(trip)}
              className="min-h-11 rounded-2xl border border-base-300 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="break-all font-mono text-primary">
                  {trip.tripNumber || `Trip #${trip.id}`}
                </strong>
                <span className="badge badge-outline">
                  Trạng thái {trip.tripStatus}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold">
                {trip.tripName || "Chưa có tên chuyến"}
              </p>
              <div className="mt-2 grid gap-1.5 text-sm text-base-content/65 sm:grid-cols-2">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  {formatTripDate(trip.tripDate)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Truck className="h-4 w-4" />
                  {trip.vehicleNumber || "Chưa có biển số"}
                </span>
                <span>{trip.driverName || "Chưa có tài xế"}</span>
                <span>{trip.agencyName || "Chưa có nhà xe"}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
