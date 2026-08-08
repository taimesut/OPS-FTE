import QRCode from "react-qr-code";

interface QRCodeModalProps {
  open: boolean;
  value: string;
  title?: string;
  description?: React.ReactNode;
  onClose: () => void;
}

export default function QRCodeModal({
  open,
  value,
  title = "QR Code",
  description,
  onClose,
}: QRCodeModalProps) {
  if (!open) return null;

  return (
    <dialog className="modal modal-open p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4">
      {/* Click nền để đóng */}
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
      <div className="modal-box max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-sm overflow-y-auto rounded-xl p-3 sm:rounded-2xl sm:p-6">
        <h3 className="break-words text-center text-lg font-bold">{title}</h3>

        <div className="flex flex-col items-center gap-5 py-5">
          <div className="aspect-square w-[min(220px,68vw)] max-w-full rounded-xl bg-white p-3 shadow-md sm:p-4">
            <QRCode value={value} size={220} style={{ width: "100%", height: "100%" }} />
          </div>

          <div className="w-full break-safe text-center">
            <div className="break-safe font-mono font-bold text-primary">{value}</div>

            {description && (
              <div className="mt-2 break-safe text-sm text-base-content/60">
                {description}
              </div>
            )}
          </div>
        </div>

        <div className="modal-action justify-center pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <button className="btn btn-outline min-h-11 rounded-xl px-8" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </dialog>
  );
}
