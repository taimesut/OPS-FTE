export type CameraFacingMode = "environment" | "user";

export function getCameraErrorMessage(err: unknown): string {
  const error = err as { name?: string; message?: string } | null;
  if (!window.isSecureContext) {
    return "Camera trực tiếp chỉ hoạt động trên HTTPS. Hãy mở ứng dụng bằng đường dẫn HTTPS.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Trình duyệt này không hỗ trợ camera trực tiếp. Hãy dùng Chrome hoặc Safari phiên bản mới.";
  }
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Quyền Camera chưa được cấp. Hãy chọn Cho phép khi trình duyệt hỏi quyền Camera.";
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "Không tìm thấy camera trên thiết bị.";
  }
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.";
  }
  return `Không thể mở Camera: ${error?.message || String(err)}`;
}

export function requestCameraStream(facingMode: CameraFacingMode = "environment") {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(getCameraErrorMessage(null));
  }
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
}
