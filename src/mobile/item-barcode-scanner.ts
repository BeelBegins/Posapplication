import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHintALLOption
} from "@capacitor/barcode-scanner";

export async function scanItemBarcode(): Promise<string> {
  const result = await CapacitorBarcodeScanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHintALLOption.ALL,
    cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
    scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
    scanInstructions: "Scan an item barcode",
    scanButton: false,
    cancelButtonAccessibilityLabel: "Cancel item scan",
    torchButtonOnAccessibilityLabel: "Turn flashlight off",
    torchButtonOffAccessibilityLabel: "Turn flashlight on",
    android: { scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.ZXING }
  });
  const value = result.ScanResult.trim();
  if (!value) throw new Error("Barcode scan was cancelled.");
  return value;
}
