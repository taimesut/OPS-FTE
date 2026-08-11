import { Camera, ImagePlus, LoaderCircle, X } from "lucide-react";

interface PdaEvidenceCaptureProps {
  open: boolean;
  pdaName: string | null;
  uploading: boolean;
  onFile: (file: File) => void;
  onClose: () => void;
}

export function PdaEvidenceCapture({
  open,
  pdaName,
  uploading,
  onFile,
  onClose,
}: PdaEvidenceCaptureProps) {
  if (!open || !pdaName) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex min-h-dvh items-end bg-slate-950/70 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pda-capture-title"
      aria-describedby="pda-capture-description"
    >
      <section className="flex min-h-[62dvh] w-full flex-col rounded-t-3xl bg-base-100 shadow-2xl sm:min-h-0 sm:max-w-md sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3 border-b border-base-200 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Bằng chứng bàn giao
            </p>
            <h2 id="pda-capture-title" className="break-safe mt-1 text-xl font-black">
              Chụp ảnh {pdaName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="btn btn-circle btn-ghost min-h-11 min-w-11 shrink-0"
            aria-label="Đóng chụp ảnh"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-1 flex-col justify-between gap-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
          <div className="rounded-2xl border border-primary/15 bg-primary/10 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-base-100 text-primary shadow-sm">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </span>
              <p id="pda-capture-description" className="text-sm leading-6 text-base-content/75">
                Ảnh là bằng chứng bắt buộc. Hãy chụp rõ toàn bộ máy và nhãn nhận diện PDA.
              </p>
            </div>
          </div>

          {uploading ? (
            <div className="flex min-h-14 items-center justify-center gap-3 rounded-xl bg-base-200 px-4 text-sm font-bold" role="status">
              <LoaderCircle className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              Đang chuẩn bị ảnh...
            </div>
          ) : (
            <label className="btn btn-primary min-h-14 w-full cursor-pointer gap-2 rounded-xl text-base">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              Mở camera chụp ảnh
              <input
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          )}
        </div>
      </section>
    </div>
  );
}
