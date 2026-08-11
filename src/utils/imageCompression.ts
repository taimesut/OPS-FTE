export const PDA_IMAGE_MAX_EDGE = 1600;
export const PDA_IMAGE_QUALITY = 0.78;
export const PDA_IMAGE_MAX_DATA_URL_BYTES = 4 * 1024 * 1024;
export const PDA_FAST_IMAGE_MAX_EDGE = 1280;
export const PDA_FAST_IMAGE_QUALITY = 0.65;
export const PDA_FAST_IMAGE_RETRY_BYTES = 1.5 * 1024 * 1024;
export const PDA_FAST_IMAGE_RETRY_MAX_EDGE = 1024;
export const PDA_FAST_IMAGE_RETRY_QUALITY = 0.5;
export const PDA_FAST_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
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

function getCanvas(
  decoded: DecodedImage,
  maxEdge: number,
): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Thiết bị không hỗ trợ xử lý ảnh.");
  context.drawImage(decoded.source, 0, 0, width, height);
  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size <= 0 || blob.type !== "image/jpeg") {
        reject(new Error("Không thể nén ảnh bằng chứng."));
        return;
      }
      resolve(blob);
    }, "image/jpeg", quality);
  });
}

export async function compressPdaEvidenceBlob(file: Blob): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size <= 0) {
    throw new Error("Vui lòng chọn một ảnh hợp lệ.");
  }

  const decoded = await decodeImage(file);
  try {
    if (decoded.width <= 0 || decoded.height <= 0) {
      throw new Error("Không thể đọc kích thước ảnh.");
    }

    let result = await canvasToJpeg(
      getCanvas(decoded, PDA_FAST_IMAGE_MAX_EDGE),
      PDA_FAST_IMAGE_QUALITY,
    );
    if (result.size > PDA_FAST_IMAGE_RETRY_BYTES) {
      result = await canvasToJpeg(
        getCanvas(decoded, PDA_FAST_IMAGE_RETRY_MAX_EDGE),
        PDA_FAST_IMAGE_RETRY_QUALITY,
      );
    }
    if (result.size > PDA_FAST_IMAGE_MAX_BYTES) {
      throw new Error("Ảnh sau khi nén vẫn vượt quá 4 MiB.");
    }
    return result;
  } finally {
    decoded.dispose();
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Không thể đọc ảnh sau khi nén."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Không thể đọc ảnh sau khi nén."));
    reader.readAsDataURL(blob);
  });
}

export async function compressPdaEvidence(file: File): Promise<string> {
  const compressed = await compressPdaEvidenceBlob(file);
  return blobToDataUrl(compressed);
}
