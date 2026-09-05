import { useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  Copy,
  FileText,
  Printer,
  RefreshCw,
  Send,
  Truck,
} from "lucide-react";
import EmbeddedQRScanner, {
  type ScanMode,
} from "../components/EmbeddedQRScanner";
import { MobileActionBar } from "../components/MobileActionBar";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/Toast";
import { decodeBarcodeImage } from "../utils/barcode";
import { getConfigs, getLogUrl } from "../utils/config";
import { IncidentItemsEditor } from "../features/incident-report/IncidentItemsEditor";
import { IncidentReportPreview } from "../features/incident-report/IncidentReportPreview";
import { TripSearchPanel } from "../features/incident-report/TripSearchPanel";
import {
  INCIDENT_REASONS,
  formatIncidentLog,
  mergeIncidentCodes,
  normalizeSearchTerm,
  removeIncidentItem,
  toggleIncidentReason,
  type IncidentItem,
  type IncidentReason,
  type LoadingKind,
  type TripDetails,
  type TripSummary,
} from "../features/incident-report/incidentReport";
import {
  fetchAllLoadingItems,
  fetchTripDetails,
  searchTrips,
} from "../features/incident-report/incidentReportApi";

type IncidentStep = "lhtrip" | "scan_items" | "preview";
type LoadStatus = "idle" | "loading" | "success" | "error";

interface BranchState<T> {
  status: LoadStatus;
  data: T | null;
  error: string;
  invalidCount: number;
}

const emptyBranch = <T,>(): BranchState<T> => ({
  status: "idle",
  data: null,
  error: "",
  invalidCount: 0,
});

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const INCIDENT_STEPS = [
  ["lhtrip", "Tìm chuyến"],
  ["scan_items", "Sự vụ"],
  ["preview", "Biên bản"],
] as const;

interface IncidentStepIndicatorProps {
  currentStep: IncidentStep;
}

const IncidentStepIndicator = ({
  currentStep,
}: IncidentStepIndicatorProps) => {
  const currentIndex = INCIDENT_STEPS.findIndex(
    ([value]) => value === currentStep,
  );

  return (
    <ol aria-label="Tiến trình tạo biên bản" className="grid grid-cols-3 gap-2">
      {INCIDENT_STEPS.map(([value, label], index) => (
        <li
          key={value}
          className={`min-w-0 rounded-xl border px-2 py-2.5 text-center text-xs font-bold sm:px-3 ${
            index === currentIndex
              ? "border-primary bg-primary/10 text-primary"
              : index < currentIndex
                ? "border-success/30 bg-success/10 text-success"
                : "border-base-200 bg-base-100 text-base-content/50"
          }`}
        >
          <span className="block truncate">
            {index + 1}. {label}
          </span>
        </li>
      ))}
    </ol>
  );
};

interface BranchStatusRowProps {
  label: string;
  status: LoadStatus;
  error: string;
  invalidCount: number;
  successText: string;
  onRetry: () => void;
}

const BranchStatusRow = ({
  label,
  status,
  error,
  invalidCount,
  successText,
  onRetry,
}: BranchStatusRowProps) => (
  <div className="flex flex-col gap-2 rounded-xl border border-base-300 p-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <strong className="text-sm">{label}</strong>
      {status === "idle" ? (
        <p className="text-sm text-base-content/55">Chưa tải</p>
      ) : null}
      {status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-base-content/60">
          <span className="loading loading-spinner loading-xs" /> Đang tải...
        </p>
      ) : null}
      {status === "success" ? (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> {successText}
        </p>
      ) : null}
      {status === "success" && invalidCount > 0 ? (
        <p className="mt-1 text-sm text-warning">
          Đã bỏ qua {invalidCount} item không có scan_number/to_number.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="break-words text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
    {status === "error" ? (
      <button
        type="button"
        className="btn btn-sm btn-outline min-h-11 gap-2"
        onClick={onRetry}
      >
        <RefreshCw className="h-4 w-4" /> Thử lại
      </button>
    ) : null}
  </div>
);

interface SelectedTripCardProps {
  trip: TripSummary;
  details: TripDetails | null;
  socName: string;
}

const SelectedTripCard = ({
  trip,
  details,
  socName,
}: SelectedTripCardProps) => (
  <section className="app-surface space-y-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-base-content/55">
          Chuyến đã chọn
        </p>
        <h2 className="mt-1 break-all font-mono text-lg font-black text-primary">
          {details?.tripNumber || trip.tripNumber || `Trip #${trip.id}`}
        </h2>
        <p className="break-words text-sm font-semibold">
          {details?.tripName || trip.tripName || "Chưa có tên chuyến"}
        </p>
      </div>
      <span className="badge badge-outline">
        Sequence {trip.displayStationSequence}
      </span>
    </div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt className="text-xs font-bold text-base-content/55">Biển số</dt>
        <dd>{details?.vehicleNumber || trip.vehicleNumber || "Chưa có"}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold text-base-content/55">Tài xế</dt>
        <dd>{details?.driverName || trip.driverName || "Chưa có"}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold text-base-content/55">Nhà xe</dt>
        <dd>{details?.agencyName || trip.agencyName || "Chưa có"}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold text-base-content/55">SOC hiện tại</dt>
        <dd>{socName || "Chưa cấu hình"}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold text-base-content/55">Loại xe</dt>
        <dd>
          {details?.vehicleTypeName || trip.vehicleTypeName || "Chưa có"}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-bold text-base-content/55">Seal</dt>
        <dd>{details?.sealCodes.join(", ") || "Chưa có"}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold text-base-content/55">
          Tổng kiện dự kiến
        </dt>
        <dd>{details?.expectedQuantity ?? "Chưa có"}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold text-base-content/55">Ngày chạy</dt>
        <dd>
          {trip.tripDate > 0
            ? new Date(trip.tripDate * 1000).toLocaleString("vi-VN")
            : "Chưa có"}
        </dd>
      </div>
    </dl>
  </section>
);

export const TaoBienBanSuVuPage = () => {
  const [step, setStep] = useState<IncidentStep>("lhtrip");
  const [scannerMode, setScannerMode] = useState<ScanMode | null>(null);
  const [decodingCapture, setDecodingCapture] = useState<ScanMode | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<TripSummary[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripSummary | null>(null);
  const [detailBranch, setDetailBranch] = useState<BranchState<TripDetails>>(
    () => emptyBranch(),
  );
  const [pendingBranch, setPendingBranch] = useState<BranchState<string[]>>(
    () => emptyBranch(),
  );
  const [inboundBranch, setInboundBranch] = useState<BranchState<string[]>>(
    () => emptyBranch(),
  );
  const [currentCode, setCurrentCode] = useState("");
  const [selectedReasons, setSelectedReasons] = useState<IncidentReason[]>([
    "Khác",
  ]);
  const [items, setItems] = useState<IncidentItem[]>([]);
  const [createdAt, setCreatedAt] = useState(() => new Date());
  const [socName] = useState(() => getConfigs().soc);
  const [isSending, setIsSending] = useState(false);
  const generationRef = useRef(0);

  const loadDetail = async (trip: TripSummary, generation: number) => {
    setDetailBranch({ ...emptyBranch<TripDetails>(), status: "loading" });
    try {
      const data = await fetchTripDetails(trip.id);
      if (generationRef.current === generation) {
        setDetailBranch({
          status: "success",
          data,
          error: "",
          invalidCount: 0,
        });
      }
    } catch (error) {
      if (generationRef.current === generation) {
        setDetailBranch({
          status: "error",
          data: null,
          error: errorText(error, "Không thể tải chi tiết chuyến."),
          invalidCount: 0,
        });
      }
    }
  };

  const loadLoadingBranch = async (
    kind: LoadingKind,
    trip: TripSummary,
    generation: number,
  ) => {
    const setBranch =
      kind === "pending" ? setPendingBranch : setInboundBranch;
    const reason: IncidentReason = kind === "pending" ? "Thiếu" : "Dư";
    setBranch({ ...emptyBranch<string[]>(), status: "loading" });

    try {
      const result = await fetchAllLoadingItems(
        kind,
        trip.id,
        trip.displayStationSequence,
      );
      if (generationRef.current !== generation) return;

      setItems((current) =>
        mergeIncidentCodes(current, result.codes, reason, "auto"),
      );
      setBranch({
        status: "success",
        data: result.codes,
        error: "",
        invalidCount: result.invalidCount,
      });
    } catch (error) {
      if (generationRef.current === generation) {
        setBranch({
          status: "error",
          data: null,
          error: errorText(error, `Không thể tải kiện ${reason}.`),
          invalidCount: 0,
        });
      }
    }
  };

  const selectTrip = (trip: TripSummary) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSelectedTrip(trip);
    setSearchResults([]);
    setSearchError("");
    setItems([]);
    setCurrentCode("");
    setCreatedAt(new Date());
    setStep("scan_items");

    void Promise.allSettled([
      loadDetail(trip, generation),
      loadLoadingBranch("pending", trip, generation),
      loadLoadingBranch("inbound", trip, generation),
    ]);
  };

  const runSearch = async (rawQuery: string) => {
    const normalized = normalizeSearchTerm(rawQuery);
    setQuery(normalized);
    if (!normalized) {
      setSearchError("Vui lòng nhập LH Trip hoặc biển số xe.");
      return;
    }

    const searchGeneration = generationRef.current + 1;
    generationRef.current = searchGeneration;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const trips = await searchTrips(normalized);
      if (generationRef.current !== searchGeneration) return;

      if (trips.length === 0) {
        setSearchError("Không tìm thấy chuyến phù hợp.");
      } else if (trips.length === 1) {
        setSearching(false);
        selectTrip(trips[0]);
      } else {
        setSearchResults(trips);
      }
    } catch (error) {
      if (generationRef.current === searchGeneration) {
        setSearchError(errorText(error, "Không thể tìm chuyến."));
      }
    } finally {
      if (generationRef.current === searchGeneration) {
        setSearching(false);
      }
    }
  };

  const handleEmbeddedScan = (value: string, mode: ScanMode) => {
    setScannerMode(null);
    const cleanCode = value.trim().toUpperCase();
    if (!cleanCode) return;

    if (mode === "lhtrip") {
      void runSearch(cleanCode);
    } else {
      setCurrentCode(cleanCode);
      showToast(`Đã nhận diện mã kiện: ${cleanCode}`, "info");
    }
  };

  const handleCapturedImage = async (
    event: ChangeEvent<HTMLInputElement>,
    mode: ScanMode,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || decodingCapture) return;

    setDecodingCapture(mode);
    try {
      const value = await decodeBarcodeImage(file);
      handleEmbeddedScan(value, mode);
    } catch {
      showToast(
        "Không tìm thấy mã QR/Barcode trong ảnh. Hãy chụp rõ và thử lại!",
        "warning",
      );
    } finally {
      setDecodingCapture(null);
    }
  };

  const toggleSelectedReason = (reason: IncidentReason) => {
    setSelectedReasons((current) => {
      if (current.includes(reason)) {
        return current.length > 1
          ? current.filter((item) => item !== reason)
          : current;
      }
      return INCIDENT_REASONS.filter(
        (item) => item === reason || current.includes(item),
      );
    });
  };

  const addManualItem = () => {
    const code = currentCode.trim().toUpperCase();
    if (!code) {
      showToast("Vui lòng nhập hoặc quét mã SPX/TO.", "warning");
      return;
    }

    setItems((current) =>
      selectedReasons.reduce(
        (next, reason) =>
          mergeIncidentCodes(next, [code], reason, "manual"),
        current,
      ),
    );
    setCurrentCode("");
    showToast("Đã thêm hoặc cập nhật mã sự vụ.", "success");
  };

  const removeItem = (id: string) => {
    setItems((current) => removeIncidentItem(current, id));
    showToast("Đã xóa mã khỏi biên bản.", "info");
  };

  const openPreview = () => {
    if (items.length === 0) {
      showToast("Chưa có mã sự vụ nào trong danh sách.", "warning");
      return;
    }
    setStep("preview");
  };

  const incidentLog = formatIncidentLog(items);
  const selectedTripNumber =
    detailBranch.data?.tripNumber || selectedTrip?.tripNumber || query;

  const handleSendLogToGgSheet = async () => {
    if (!items.length) {
      showToast("Chưa có mã sự vụ nào trong danh sách!", "warning");
      return;
    }

    const logUrl = getLogUrl();
    if (!logUrl) {
      showToast(
        "Chưa cài đặt Link Google Sheet nhận Log! Bạn có thể vào Cài Đặt để dán Webhook.",
        "warning",
      );
      return;
    }

    setIsSending(true);
    try {
      await fetch(logUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          lhTrip: selectedTripNumber.trim().toUpperCase(),
          incidentLogs: incidentLog,
        }),
      });
      showToast("Đã gửi thành công Log Sự Vụ về Google Sheet!", "success");
    } catch (error) {
      console.error("[Submit Log Error]", error);
      showToast(
        "Gửi log về Google Sheet thất bại. Kiểm tra lại đường dẫn Webhook!",
        "error",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyFormattedLog = async () => {
    try {
      await navigator.clipboard.writeText(incidentLog);
      showToast("Đã sao chép chuỗi sự vụ vào Clipboard!", "success");
    } catch {
      showToast("Không thể sao chép Clipboard trên thiết bị này.", "error");
    }
  };

  const resetAll = () => {
    generationRef.current += 1;
    setStep("lhtrip");
    setScannerMode(null);
    setDecodingCapture(null);
    setQuery("");
    setSearching(false);
    setSearchError("");
    setSearchResults([]);
    setSelectedTrip(null);
    setDetailBranch(emptyBranch());
    setPendingBranch(emptyBranch());
    setInboundBranch(emptyBranch());
    setCurrentCode("");
    setSelectedReasons(["Khác"]);
    setItems([]);
    setCreatedAt(new Date());
  };

  return (
    <div className="app-page max-w-6xl space-y-5 text-base-content md:space-y-6">
      <EmbeddedQRScanner
        open={scannerMode !== null}
        mode={scannerMode}
        onScan={handleEmbeddedScan}
        onClose={() => setScannerMode(null)}
      />

      <PageHeader
        icon={Truck}
        title="Tạo Biên Bản Sự Vụ LH TRIP"
        description="Tìm chuyến, tự tải kiện Thiếu/Dư và lập biên bản theo dữ liệu SPX"
      />
      <IncidentStepIndicator currentStep={step} />

      {step === "lhtrip" ? (
        <TripSearchPanel
          query={query}
          onQueryChange={setQuery}
          loading={searching}
          decodingImage={decodingCapture === "lhtrip"}
          error={searchError}
          results={searchResults}
          onSearch={() => void runSearch(query)}
          onSelect={selectTrip}
          onOpenScanner={() => setScannerMode("lhtrip")}
          onCaptureImage={(event) =>
            void handleCapturedImage(event, "lhtrip")
          }
        />
      ) : null}

      {step === "scan_items" && selectedTrip ? (
        <div className="space-y-5">
          <MobileActionBar className="sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={resetAll}
              className="btn btn-ghost min-h-11 gap-2"
            >
              <ChevronLeft className="h-4 w-4" /> Đổi chuyến
            </button>
            <button
              type="button"
              onClick={openPreview}
              disabled={items.length === 0}
              className="btn btn-primary min-h-11 gap-2"
            >
              <FileText className="h-4 w-4" /> Xem trước biên bản
            </button>
          </MobileActionBar>

          <SelectedTripCard
            trip={selectedTrip}
            details={detailBranch.data}
            socName={socName}
          />

          <section className="app-surface space-y-3 p-4 sm:p-5">
            <h3 className="font-black">Trạng thái đồng bộ SPX</h3>
            <div className="grid gap-3 lg:grid-cols-3">
              <BranchStatusRow
                label="Chi tiết chuyến"
                status={detailBranch.status}
                error={detailBranch.error}
                invalidCount={detailBranch.invalidCount}
                successText="Đã tải thông tin chuyến."
                onRetry={() =>
                  void loadDetail(selectedTrip, generationRef.current)
                }
              />
              <BranchStatusRow
                label="Kiện thiếu"
                status={pendingBranch.status}
                error={pendingBranch.error}
                invalidCount={pendingBranch.invalidCount}
                successText={`Đã tải ${pendingBranch.data?.length ?? 0} mã thiếu.`}
                onRetry={() =>
                  void loadLoadingBranch(
                    "pending",
                    selectedTrip,
                    generationRef.current,
                  )
                }
              />
              <BranchStatusRow
                label="Kiện dư"
                status={inboundBranch.status}
                error={inboundBranch.error}
                invalidCount={inboundBranch.invalidCount}
                successText={`Đã tải ${inboundBranch.data?.length ?? 0} mã dư.`}
                onRetry={() =>
                  void loadLoadingBranch(
                    "inbound",
                    selectedTrip,
                    generationRef.current,
                  )
                }
              />
            </div>
          </section>

          <IncidentItemsEditor
            items={items}
            code={currentCode}
            selectedReasons={selectedReasons}
            decodingImage={decodingCapture === "item"}
            onCodeChange={setCurrentCode}
            onReasonChange={toggleSelectedReason}
            onAdd={addManualItem}
            onToggleItemReason={(id, reason) =>
              setItems((current) =>
                toggleIncidentReason(current, id, reason),
              )
            }
            onRemove={removeItem}
            onOpenScanner={() => setScannerMode("item")}
            onCaptureImage={(event) =>
              void handleCapturedImage(event, "item")
            }
          />
        </div>
      ) : null}

      {step === "preview" && selectedTrip ? (
        <div className="space-y-5">
          <MobileActionBar className="sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setStep("scan_items")}
              className="btn btn-ghost min-h-11 gap-2"
            >
              <ChevronLeft className="h-4 w-4" /> Quay lại sự vụ
            </button>
            <div className="grid gap-2 sm:flex">
              <button
                type="button"
                onClick={() => void handleSendLogToGgSheet()}
                disabled={isSending}
                className="btn btn-success min-h-11 gap-2"
              >
                {isSending ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Gửi Log
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-primary min-h-11 gap-2"
              >
                <Printer className="h-4 w-4" /> In biên bản
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="btn btn-outline min-h-11"
              >
                Tạo LH Trip mới
              </button>
            </div>
          </MobileActionBar>

          <section className="space-y-3 rounded-2xl bg-slate-900 p-4 text-slate-100 shadow-lg sm:p-5">
            <div className="flex flex-col gap-3 border-b border-slate-700 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-400">
                Log Google Sheet
              </h3>
              <button
                type="button"
                onClick={() => void handleCopyFormattedLog()}
                className="btn btn-sm btn-outline btn-warning min-h-11 gap-2"
              >
                <Copy className="h-4 w-4" /> Sao chép
              </button>
            </div>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-slate-400">Cột 1 — LH Trip</dt>
                <dd className="break-all font-mono font-bold text-emerald-400">
                  {selectedTripNumber}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Cột 2 — Sự vụ</dt>
                <dd className="mt-1 break-all rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono font-bold leading-relaxed text-amber-300">
                  {incidentLog || "---"}
                </dd>
              </div>
            </dl>
          </section>

          <IncidentReportPreview
            socName={socName}
            trip={selectedTrip}
            details={detailBranch.data}
            items={items}
            createdAt={createdAt}
          />
        </div>
      ) : null}
    </div>
  );
};
