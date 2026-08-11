export const PDA_IMAGE_MAX_EDGE = 1600;
export const PDA_IMAGE_QUALITY = 0.78;
export const PDA_IMAGE_MAX_DATA_URL_BYTES = 4 * 1024 * 1024;

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Không thể đọc ảnh đã chọn."));
      image.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function compressPdaEvidence(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size <= 0) {
    throw new Error("Vui lòng chọn một ảnh hợp lệ.");
  }

  const decoded = await decodeImage(file);
  try {
    if (decoded.width <= 0 || decoded.height <= 0) {
      throw new Error("Không thể đọc kích thước ảnh.");
    }

    const scale = Math.min(
      1,
      PDA_IMAGE_MAX_EDGE / Math.max(decoded.width, decoded.height),
    );
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Thiết bị không hỗ trợ xử lý ảnh.");
    context.drawImage(decoded.source, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", PDA_IMAGE_QUALITY);
    if (dataUrl.length > PDA_IMAGE_MAX_DATA_URL_BYTES) {
      throw new Error("Ảnh sau khi nén vẫn vượt quá 4 MiB.");
    }
    return dataUrl;
  } finally {
    decoded.dispose();
  }
}
