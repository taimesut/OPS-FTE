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
    <dialog className="modal modal-open">
      {/* Click nền để đóng */}
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
      <div className="modal-box max-w-sm rounded-2xl">
        <h3 className="text-lg font-bold text-center">{title}</h3>

        <div className="flex flex-col items-center gap-5 py-5">
          <div className="rounded-xl bg-white p-4 shadow-md">
            <QRCode value={value} size={220} />
          </div>

          <div className="text-center break-all">
            <div className="font-mono font-bold text-primary">{value}</div>

            {description && (
              <div className="mt-2 text-sm text-base-content/60">
                {description}
              </div>
            )}
          </div>
        </div>

        <div className="modal-action justify-center">
          <button className="btn btn-outline rounded-xl px-8" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </dialog>
  );
}
