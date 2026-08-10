import { type FormEvent, useState } from "react";
import { PackageCheck, QrCode, ScanLine, Search } from "lucide-react";
import EmbeddedQRScanner, {
  type ScanMode,
} from "../components/EmbeddedQRScanner";
import { PageHeader } from "../components/PageHeader";
import QRCodeModal from "../components/QRCodeModal";
import { showToast } from "../components/Toast";
import { getCookies } from "../utils/config";
import type { TransferOrderLookupResult } from "../utils/transferOrderLookup";
import { fetchTransferOrderNumber } from "../utils/transferOrderLookupApi";

const LOOKUP_ERROR_MESSAGE =
  "Không thể lấy mã TO. Vui lòng kiểm tra kết nối và thử lại.";

export const LayMaTOPage = () => {
  const [shipmentId, setShipmentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransferOrderLookupResult | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<ScanMode | null>(null);

  const handleScan = (value: string) => {
    const normalizedValue = value.trim();
    setScannerMode(null);
    if (!normalizedValue) return;

    setShipmentId(normalizedValue);
    showToast(`Đã nhận mã đơn: ${normalizedValue}`, "success");
  };

  const handleLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedShipmentId = shipmentId.trim();

    if (!normalizedShipmentId) {
      showToast("Vui lòng nhập mã đơn hàng.", "warning");
      return;
    }

    if (!getCookies()) {
      showToast(
        "Chưa có Cookie SPX. Vui lòng cập nhật trong Cài đặt.",
        "error",
      );
      return;
    }

    setLoading(true);
    try {
      const nextResult = await fetchTransferOrderNumber(normalizedShipmentId);
      setResult(nextResult);
      setQrOpen(true);
      showToast(`Đã lấy mã TO ${nextResult.currentToNumber}.`, "success");
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : LOOKUP_ERROR_MESSAGE;
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page space-y-5 text-base-content md:space-y-6">
      <EmbeddedQRScanner
        open={scannerMode !== null}
        mode={scannerMode}
        onScan={handleScan}
        onClose={() => setScannerMode(null)}
      />

      <PageHeader
        icon={QrCode}
        title="Lấy mã Transfer Order"
        description="Tra cứu mã TO từ mã đơn hàng và hiển thị QR để quét nhanh."
      />

      <section
        className="app-surface overflow-hidden"
        aria-labelledby="to-lookup-heading"
      >
        <div className="border-b border-base-200 bg-base-200/40 px-4 py-3 sm:px-5">
          <h2 id="to-lookup-heading" className="font-extrabold">
            Nhập mã đơn hàng
          </h2>
          <p className="mt-1 text-xs text-base-content/60">
            Ví dụ: SPXVN062072327098
          </p>
        </div>

        <form onSubmit={handleLookup} className="grid gap-4 p-4 sm:p-5">
          <label className="form-control w-full">
            <span className="label-text mb-2 text-sm">Mã đơn hàng SPX</span>
            <input
              type="text"
              value={shipmentId}
              onChange={(event) => setShipmentId(event.target.value)}
              placeholder="Nhập mã đơn hàng"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
              className="input input-bordered min-h-12 w-full rounded-xl font-mono uppercase focus:input-primary"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary min-h-12 w-full gap-2 rounded-xl shadow-xs"
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Đang lấy mã TO
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Lấy mã TO
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setScannerMode("item")}
              disabled={loading}
              className="btn btn-outline min-h-12 w-full gap-2 rounded-xl"
            >
              <ScanLine className="h-5 w-5" aria-hidden="true" />
              Quét QR
            </button>
          </div>
        </form>
      </section>

      <section aria-live="polite" aria-labelledby="latest-to-heading">
        {result ? (
          <div className="app-surface p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="app-icon-badge shrink-0 bg-success/10 text-success">
                <PackageCheck aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="latest-to-heading" className="app-section-title">
                  Kết quả gần nhất
                </h2>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-base-content/55">Mã đơn</dt>
                    <dd className="break-safe mt-1 font-mono font-semibold">
                      {result.shipmentId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-base-content/55">Mã TO</dt>
                    <dd className="break-safe mt-1 font-mono text-lg font-black text-primary">
                      {result.currentToNumber}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  className="btn btn-outline btn-primary mt-5 min-h-11 w-full gap-2 rounded-xl sm:w-auto"
                >
                  <QrCode className="h-4 w-4" aria-hidden="true" />
                  Hiện lại QR
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="app-surface p-5 text-center text-sm text-base-content/60">
            Kết quả TO gần nhất sẽ xuất hiện tại đây.
          </div>
        )}
      </section>

      <QRCodeModal
        open={qrOpen && result !== null}
        value={result?.currentToNumber ?? ""}
        title="Mã QR Transfer Order"
        description={result ? <>Mã đơn: {result.shipmentId}</> : undefined}
        onClose={() => setQrOpen(false)}
      />
    </div>
  );
};
