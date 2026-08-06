import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

const SUPPORTED_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.ITF,
];

export async function decodeBarcodeImage(file: File): Promise<string> {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);

  const imageUrl = URL.createObjectURL(file);
  try {
    const reader = new BrowserMultiFormatReader(hints);
    const result = await reader.decodeFromImageUrl(imageUrl);
    return result.getText();
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
