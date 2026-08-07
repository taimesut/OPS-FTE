import { useCallback, useState } from "react";
import { showToast } from "../components/Toast";
import { getLogUrl } from "../utils/config";
import { decodeBarcodeImage } from "../utils/barcode";
import EmbeddedQRScanner, { type ScanMode } from "../components/EmbeddedQRScanner";
import {
  QrCode,
  FileText,
  CheckCircle2,
  Printer,
  Plus,
  Trash2,
  Send,
  Truck,
  Package,
  ChevronLeft,
  Copy,
} from "lucide-react";

export interface IncidentItem {
  id: string;
  trackingCode: string;
  reason: string;
}

const REASON_OPTIONS = [
  "Hàng móp bẹp / Hư hỏng vỏ",
  "Rách bao / Thiếu kiện",
  "Dính chất lỏng / Ẩm ướt",
  "Mất tem nhãn / Sai mã",
  "Sự vụ bất thường khác",
];

interface IncidentItemCardProps {
  item: IncidentItem;
  index: number;
  onRemove: () => void;
}

const IncidentItemCard = ({ item, index, onRemove }: IncidentItemCardProps) => (
  <article className="rounded-2xl border border-base-200 bg-base-100 p-4 shadow-xs">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-wide text-base-content/50">Đơn sự vụ #{index + 1}</span>
        <p className="mt-1 break-all font-mono text-base font-black text-primary">{item.trackingCode}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="btn btn-ghost btn-circle min-h-11 min-w-11 shrink-0 text-error"
        aria-label="Xóa đơn sự vụ"
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
    <div className="mt-3 border-t border-base-200 pt-3">
      <span className="text-[11px] font-bold uppercase tracking-wide text-base-content/50">Lý do sự vụ</span>
      <p className="mt-1 text-sm font-semibold">{item.reason}</p>
    </div>
  </article>
);

export const TaoBienBanSuVuPage = () => {
  const [step, setStep] = useState<"lhtrip" | "scan_items" | "preview">("lhtrip");
  const [decodingCapture, setDecodingCapture] = useState<"lhtrip" | "item" | null>(null);
  const [scannerMode, setScannerMode] = useState<ScanMode | null>(null);

  // Step 1: Mã LH TRIP
  const [lhTrip, setLhTrip] = useState("");

  // Step 2: Form thêm đơn sự vụ
  const [currentCode, setCurrentCode] = useState("");
  const [currentReason, setCurrentReason] = useState(REASON_OPTIONS[0]);
  const [items, setItems] = useState<IncidentItem[]>([]);

  // Step 3: Submitting state
  const [isSending, setIsSending] = useState(false);

  const applyScannedValue = useCallback((value: string, mode: ScanMode) => {
    const cleanCode = value.trim().toUpperCase();
    if (!cleanCode) return;
    if (mode === "lhtrip") {
      setLhTrip(cleanCode);
      setStep("scan_items");
      showToast(`Đã quét mã LH TRIP: ${cleanCode}`, "success");
    } else {
      setCurrentCode(cleanCode);
      showToast(`Đã nhận diện mã đơn: ${cleanCode}`, "info");
    }
  }, []);

  const handleEmbeddedScan = useCallback((value: string, mode: ScanMode) => {
    applyScannedValue(value, mode);
    setScannerMode(null);
  }, [applyScannedValue]);
  const handleCapturedImage = async (
    event: React.ChangeEvent<HTMLInputElement>,
    mode: "lhtrip" | "item",
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || decodingCapture) return;

    setDecodingCapture(mode);
    try {
      applyScannedValue(await decodeBarcodeImage(file), mode);
    } catch {
      showToast("Không tìm thấy mã QR/Barcode trong ảnh. Hãy chụp rõ và thử lại!", "warning");
    } finally {
      setDecodingCapture(null);
    }
  };

  // Xử lý bước 1 -> 2
  const handleStartScanItems = () => {
    if (!lhTrip.trim()) {
      showToast("Vui lòng nhập hoặc quét mã LH TRIP!", "warning");
      return;
    }
    setStep("scan_items");
  };

  // Thêm đơn sự vụ vào danh sách
  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = currentCode.trim().toUpperCase();

    if (!code) {
      showToast("Vui lòng nhập mã đơn hàng!", "warning");
      return;
    }

    if (items.some((item) => item.trackingCode === code)) {
      showToast(`Mã đơn ${code} đã có trong danh sách!`, "warning");
      return;
    }

    const newItem: IncidentItem = {
      id: Math.random().toString(36).substring(2, 9),
      trackingCode: code,
      reason: currentReason,
    };

    setItems((prev) => [newItem, ...prev]);
    setCurrentCode("");
    showToast(`Đã thêm đơn: ${code}`, "success");
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    showToast("Đã xóa đơn khỏi danh sách", "info");
  };

  // Chuyển chuỗi định dạng 2 cột: Mã đơn 1@lí do#Mã đơn 2@lí do
  const getIncidentLogsString = (): string => {
    return items
      .map((item) => `${item.trackingCode}@${item.reason}`)
      .join("#");
  };

  // Gửi Log về Google Sheet URL
  const handleSendLogToGgSheet = async () => {
    const logUrl = getLogUrl();
    const formattedLogString = getIncidentLogsString();

    if (!items.length) {
      showToast("Chưa có đơn sự vụ nào trong danh sách!", "warning");
      return;
    }

    if (!logUrl) {
      showToast(
        "Chưa cài đặt Link Google Sheet nhận Log! Bạn có thể vào Cài Đặt để dán Webhook.",
        "warning"
      );
      return;
    }

    setIsSending(true);

    try {
      // POST JSON payload với mode: 'no-cors' và Content-Type: 'text/plain' giúp vượt rào CORS/Redirect của Google Apps Script Web App
      const payload = JSON.stringify({
        lhTrip: lhTrip.trim().toUpperCase(),
        incidentLogs: formattedLogString,
      });

      await fetch(logUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain",
        },
        body: payload,
      });

      showToast("Đã gửi thành công Log Sự Vụ về Google Sheet!", "success");
    } catch (err) {
      console.error("[Submit Log Error]", err);
      showToast("Gửi log về Google Sheet thất bại. Kiểm tra lại đường dẫn Webhook!", "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyFormattedLog = () => {
    const logString = getIncidentLogsString();
    navigator.clipboard.writeText(logString);
    showToast("Đã sao chép chuỗi định dạng sự vụ vào Clipboard!", "success");
  };

  const handlePrint = () => {
    window.print();
  };

  const resetAll = () => {
    setLhTrip("");
    setCurrentCode("");
    setItems([]);
    setStep("lhtrip");
  };

  return (
    <div className="mx-auto max-w-4xl p-3 pb-20 sm:p-4 md:p-6 font-sans text-base-content space-y-5 md:space-y-6">
      <EmbeddedQRScanner
        open={scannerMode !== null}
        mode={scannerMode}
        onScan={handleEmbeddedScan}
        onClose={() => setScannerMode(null)}
      />

      {/* Header Section */}
      <div className="border-b border-base-200 pb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-primary/10 text-primary rounded-xl">
              <Truck className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight">
              Tạo Biên Bản Sự Vụ LH TRIP
            </h1>
          </div>
          <p className="text-xs md:text-sm text-base-content/60 mt-1">
            Quét mã chuyến xe Linehaul (LH TRIP), nhập các đơn sự vụ và tự động xuất log Google Sheet
          </p>
        </div>
      </div>

      {/* BƯỚC 1: Quét / Nhập mã LH TRIP */}
      {step === "lhtrip" && (
        <div className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl p-5 md:p-8 space-y-6">
          <div className="space-y-3">
            <label className="text-base font-bold flex items-center gap-2 text-base-content">
              <Truck className="w-5 h-5 text-primary" />
              Bước 1: Quét hoặc Nhập mã LH TRIP (Linehaul Trip):
            </label>

            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={lhTrip}
                onChange={(e) => setLhTrip(e.target.value.toUpperCase())}
                placeholder="Dán hoặc quét mã chuyến LH..."
                className="input input-bordered w-full focus:input-primary text-xl font-mono font-bold tracking-wider rounded-xl uppercase h-14"
                autoFocus
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    onClick={() => setScannerMode("lhtrip")}
                    className="btn btn-primary flex-1 h-12 gap-2 rounded-xl text-sm font-bold shadow-xs"
                  >
                    <QrCode className="w-5 h-5" /> Quét trực tiếp
                  </button>
                <label
                  className={`btn btn-secondary flex-1 h-12 gap-2 rounded-xl text-sm font-bold shadow-xs ${
                    decodingCapture ? "btn-disabled" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={decodingCapture !== null}
                    onChange={(event) => void handleCapturedImage(event, "lhtrip")}
                  />
                  {decodingCapture === "lhtrip" ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <QrCode className="w-5 h-5" />
                  )}
                  {decodingCapture === "lhtrip"
                    ? "Đang đọc mã..."
                    : "Chụp ảnh"}
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-base-200 pt-5">
            <button
              onClick={handleStartScanItems}
              className="btn btn-primary gap-2 w-full sm:w-auto rounded-xl h-12 text-base font-bold px-8 shadow-md"
            >
              Bắt đầu thêm đơn sự vụ
              <Package className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* BƯỚC 2: Quét / Nhập thêm các đơn bị sự vụ thuộc mã LH TRIP */}
      {step === "scan_items" && (
        <div className="space-y-6">
          {/* Active LH TRIP Banner */}
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-primary text-primary-content rounded-xl font-bold">
                <Truck className="w-5 h-5" />
              </span>
              <div>
                <span className="text-xs text-base-content/60 font-semibold block">
                  Mã LH TRIP đang chọn:
                </span>
                <strong className="text-xl font-mono font-black text-primary">
                  {lhTrip}
                </strong>
              </div>
            </div>
            <button
              onClick={() => setStep("lhtrip")}
              className="btn btn-sm min-h-11 btn-ghost text-xs gap-1 self-start sm:self-auto"
            >
              <ChevronLeft className="w-4 h-4" /> Đổi LH TRIP
            </button>
          </div>

          {/* Form thêm đơn hàng sự vụ */}
          <form
            onSubmit={handleAddItem}
            className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl p-5 md:p-6 space-y-4"
          >
            <h3 className="text-base font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-secondary" />
              Bước 2: Thêm đơn bị sự vụ vào LH TRIP
            </h3>

            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={currentCode}
                onChange={(e) => setCurrentCode(e.target.value.toUpperCase())}
                placeholder="Nhập hoặc quét mã đơn bị sự vụ..."
                className="input input-bordered w-full focus:input-primary text-lg font-mono font-bold rounded-xl uppercase"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    onClick={() => setScannerMode("item")}
                    className="btn btn-primary flex-1 gap-2 rounded-xl font-bold"
                  >
                    <QrCode className="w-5 h-5" /> Quét trực tiếp
                  </button>
                <label
                  className={`btn btn-secondary flex-1 gap-2 rounded-xl font-bold ${
                    decodingCapture ? "btn-disabled" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={decodingCapture !== null}
                    onChange={(event) => void handleCapturedImage(event, "item")}
                  />
                  {decodingCapture === "item" ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <QrCode className="w-5 h-5" />
                  )}
                  {decodingCapture === "item"
                    ? "Đang đọc mã..."
                    : "Chụp ảnh"}
                </label>
              </div>
            </div>

            {/* Chọn lý do sự vụ */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-base-content/70 block">
                Chọn lý do sự vụ cho đơn này:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REASON_OPTIONS.map((reason) => {
                  const isSelected = currentReason === reason;
                  return (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setCurrentReason(reason)}
                      className={`min-h-11 p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-base-200 bg-base-100 hover:bg-base-200/50 text-base-content/70"
                      }`}
                    >
                      <span>{reason}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="btn btn-primary min-h-11 gap-2 w-full sm:w-auto rounded-xl font-bold"
              >
                <Plus className="w-5 h-5" /> Thêm đơn này
              </button>
            </div>
          </form>

          {/* Bảng danh sách đơn sự vụ đã thêm */}
          <div className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-base-200 bg-base-200/30 flex items-center justify-between">
              <span className="font-bold text-sm">
                Danh sách đơn sự vụ ({items.length} đơn)
              </span>
              {items.length > 0 && (
                <button
                  onClick={() => setStep("preview")}
                  className="btn btn-sm min-h-11 btn-primary gap-1.5 rounded-xl font-bold"
                >
                  <FileText className="w-4 h-4" /> Xem trước & Gửi log
                </button>
              )}
            </div>

            {items.length > 0 ? (
              <>
                <div className="space-y-3 p-3 md:hidden">
                  {items.map((item, index) => (
                    <IncidentItemCard
                      key={item.id}
                      item={item}
                      index={index}
                      onRemove={() => handleRemoveItem(item.id)}
                    />
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="table table-sm w-full">
                    <thead className="bg-base-200/50 text-xs font-bold">
                      <tr>
                        <th className="w-12 text-center">STT</th>
                        <th>Mã đơn hàng</th>
                        <th>Lý do sự vụ</th>
                        <th className="w-16 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-base-200 text-sm font-medium">
                      {items.map((item, index) => (
                        <tr key={item.id} className="hover:bg-base-200/30">
                          <td className="text-center font-bold text-base-content/60">{index + 1}</td>
                          <td className="break-all font-mono font-bold text-primary">{item.trackingCode}</td>
                          <td>
                            <span className="badge badge-warning badge-sm font-bold">{item.reason}</span>
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="btn btn-xs btn-ghost btn-circle min-h-10 min-w-10 text-error"
                              aria-label="Xóa đơn sự vụ"
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
            ) : (
              <div className="p-8 text-center text-base-content/60 text-sm">
                Chưa có đơn sự vụ nào. Hãy quét hoặc nhập mã đơn hàng phía trên.
              </div>
            )}
          </div>
        </div>
      )}

      {/* BƯỚC 3: Gửi Log & Xem Trước Biên Bản */}
      {step === "preview" && (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-base-100 p-4 border border-base-200 rounded-2xl shadow-xs">
            <button
              onClick={() => setStep("scan_items")}
              className="btn btn-sm min-h-11 btn-ghost gap-1 rounded-xl"
            >
              <ChevronLeft className="w-4 h-4" /> Quay lại thêm đơn
            </button>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <button
                onClick={handleSendLogToGgSheet}
                disabled={isSending}
                className="btn btn-sm min-h-11 btn-success text-success-content gap-1.5 rounded-xl font-bold shadow-xs"
              >
                {isSending ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Gửi Log Google Sheet
              </button>

              <button
                onClick={handlePrint}
                className="btn btn-sm min-h-11 btn-primary gap-1.5 rounded-xl font-bold shadow-xs"
              >
                <Printer className="w-4 h-4" /> In biên bản
              </button>

              <button
                onClick={resetAll}
                className="btn btn-sm min-h-11 btn-outline rounded-xl"
              >
                Tạo LH TRIP mới
              </button>
            </div>
          </div>

          {/* Formatted Log String Preview Box */}
          <div className="card bg-slate-900 text-slate-100 rounded-2xl p-5 space-y-3 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Định dạng xuất log Google Sheet (2 Cột)
              </span>
              <button
                onClick={handleCopyFormattedLog}
                className="btn btn-xs btn-outline btn-warning gap-1 rounded-lg"
              >
                <Copy className="w-3.5 h-3.5" /> Sao chép chuỗi
              </button>
            </div>

            <div className="space-y-2 font-mono text-xs md:text-sm">
              <div>
                <span className="text-slate-400 block">Cột 1 (LH TRIP):</span>
                <strong className="text-emerald-400 text-base">{lhTrip}</strong>
              </div>

              <div>
                <span className="text-slate-400 block">
                  Cột 2 (Đơn sự vụ định dạng: Mã đơn 1@lí do#Mã đơn 2@lí do):
                </span>
                <div className="p-3 bg-slate-950 rounded-xl text-amber-300 break-all leading-relaxed border border-slate-800 font-bold">
                  {getIncidentLogsString() || "---"}
                </div>
              </div>
            </div>
          </div>

          {/* Printable Report Document Card */}
          <div className="bg-white text-slate-900 border border-slate-300 rounded-2xl p-6 md:p-8 shadow-md font-sans print:shadow-none print:border-none">
            <div className="text-center border-b-2 border-slate-800 pb-4 mb-6">
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-wide text-slate-900">
                BIÊN BẢN SỰ VỤ TỔNG HỢP LH TRIP
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                MÃ LH TRIP: {lhTrip} | THỜI GIAN: {new Date().toLocaleString("vi-VN")}
              </p>
            </div>

            <div className="mb-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">
                Danh sách chi tiết {items.length} đơn sự vụ:
              </h4>
              <table className="w-full text-xs md:text-sm border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                    <th className="p-2 w-12 text-center border-r border-slate-300">STT</th>
                    <th className="p-2 border-r border-slate-300 text-left">Mã Đơn Hàng</th>
                    <th className="p-2 text-left">Lý Do Sự Vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id} className="border-b border-slate-200">
                      <td className="p-2 text-center font-bold border-r border-slate-300">
                        {index + 1}
                      </td>
                      <td className="p-2 font-mono font-bold border-r border-slate-300 text-slate-900">
                        {item.trackingCode}
                      </td>
                      <td className="p-2 text-slate-800">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Signature blocks */}
            <div className="grid grid-cols-2 text-center text-xs pt-6 border-t border-slate-300">
              <div>
                <strong className="block font-bold text-slate-900">NGƯỜI LẬP BIÊN BẢN</strong>
                <span className="text-slate-500">(Ký & ghi rõ họ tên)</span>
                <div className="h-16"></div>
                <span className="font-semibold text-slate-800">------------------</span>
              </div>
              <div>
                <strong className="block font-bold text-slate-900">XÁC NHẬN KHO / TÀI XẾ</strong>
                <span className="text-slate-500">(Ký & ghi rõ họ tên)</span>
                <div className="h-16"></div>
                <span className="font-semibold text-slate-800">------------------</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
