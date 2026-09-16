import { Copy, QrCode, RefreshCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import QRCode from "react-qr-code";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/Toast";

const MAX_QR_CONTENT_LENGTH = 2000;

export const TaoMaQRPage = () => {
  const [content, setContent] = useState("");
  const [generatedValue, setGeneratedValue] = useState("");

  const handleGenerate = () => {
    if (!content.trim()) {
      showToast("Vui lòng nhập nội dung cần tạo mã QR.", "warning");
      return;
    }

    setGeneratedValue(content);
  };

  const handleReset = () => {
    setContent("");
    setGeneratedValue("");
  };

  const handleCopy = async () => {
    if (!generatedValue) return;

    try {
      await navigator.clipboard.writeText(generatedValue);
      showToast("Đã sao chép nội dung mã QR.", "success");
    } catch {
      showToast("Không thể sao chép trên thiết bị này.", "error");
    }
  };

  return (
    <div className="app-page max-w-4xl space-y-5 text-base-content md:space-y-6">
      <PageHeader
        icon={QrCode}
        title="Tạo mã QR"
        description="Nhập văn bản, mã đơn, đường dẫn hoặc nội dung bất kỳ rồi tạo mã QR ngay trên thiết bị."
      />

      <section className="app-surface space-y-4 p-4 sm:p-5">
        <div>
          <label htmlFor="qr-generator-content" className="text-sm font-black">
            Nội dung cần tạo mã QR
          </label>
          <p className="mt-1 text-xs leading-relaxed text-base-content/55">
            Mã QR chỉ được tạo khi bạn nhấn nút bên dưới, vì vậy bạn có thể chỉnh nội dung trước khi xuất mã.
          </p>
        </div>

        <textarea
          id="qr-generator-content"
          value={content}
          maxLength={MAX_QR_CONTENT_LENGTH}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Ví dụ: SPXVN..., LT..., https://..., hoặc nội dung văn bản"
          className="textarea textarea-bordered min-h-32 w-full resize-y rounded-xl text-base leading-relaxed"
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-medium text-base-content/45">
            {content.length.toLocaleString("vi-VN")} / {MAX_QR_CONTENT_LENGTH.toLocaleString("vi-VN")} ký tự
          </span>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={handleReset}
              disabled={!content && !generatedValue}
              className="btn btn-ghost min-h-11 gap-2 rounded-xl"
            >
              <RefreshCcw className="h-4 w-4" />
              Xóa
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!content.trim()}
              className="btn btn-primary min-h-11 gap-2 rounded-xl"
            >
              <Sparkles className="h-4 w-4" />
              Tạo mã QR
            </button>
          </div>
        </div>
      </section>

      {generatedValue ? (
        <section className="app-surface overflow-hidden">
          <div className="border-b border-base-200 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-black">Mã QR đã tạo</h2>
                <p className="mt-0.5 text-xs text-base-content/55">
                  Quét trực tiếp trên màn hình hoặc dùng nội dung bên dưới để đối chiếu.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="btn btn-ghost btn-sm min-h-10 shrink-0 gap-2 rounded-xl"
              >
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">Sao chép</span>
              </button>
            </div>
          </div>

          <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-center">
            <div className="mx-auto aspect-square w-[min(78vw,300px)] rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5 md:w-full">
              <QRCode
                value={generatedValue}
                size={300}
                level="M"
                style={{ width: "100%", height: "100%" }}
              />
            </div>

            <div className="min-w-0 rounded-xl bg-base-200/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-base-content/45">
                Nội dung QR
              </p>
              <p className="mt-2 whitespace-pre-wrap break-safe text-sm leading-relaxed">
                {generatedValue}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-base-300 bg-base-100/60 px-5 py-10 text-center">
          <QrCode className="mx-auto h-10 w-10 text-base-content/25" />
          <p className="mt-3 text-sm font-bold text-base-content/60">
            Mã QR sẽ xuất hiện ở đây sau khi tạo.
          </p>
        </section>
      )}
    </div>
  );
};
