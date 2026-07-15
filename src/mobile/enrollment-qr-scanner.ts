import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint
} from "@capacitor/barcode-scanner";

interface EnrollmentScanner {
  scanBarcode(options: Parameters<typeof CapacitorBarcodeScanner.scanBarcode>[0]): ReturnType<typeof CapacitorBarcodeScanner.scanBarcode>;
}

export async function scanEnrollmentQr(scanner: EnrollmentScanner = CapacitorBarcodeScanner): Promise<string> {
  const result = await scanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
    cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
    scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
    scanInstructions: "Scan the Ai Matic device enrollment QR code",
    scanButton: false,
    cancelButtonAccessibilityLabel: "Cancel device enrollment scan",
    torchButtonOnAccessibilityLabel: "Turn flashlight off",
    torchButtonOffAccessibilityLabel: "Turn flashlight on",
    android: { scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.ZXING }
  });
  const value = result.ScanResult.trim();
  if (!value) throw new Error("QR scan was cancelled or did not contain an enrollment value.");
  return value;
}
