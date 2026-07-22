import { Geolocation } from "@capacitor/geolocation";

export const VISIT_QUEUE_KEY = "aimatic-sales-visit-queue-v1";

export interface VisitLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export interface VisitOperation extends VisitLocation {
  requestId: string;
  action: "check_in" | "check_out";
  visitId: string;
  customer: string;
  scheduledDate: string;
  branch?: string;
  warehouse?: string;
  notes: string;
  photos: string[];
  queuedAt: string;
  error?: string;
}

export function newVisitRequestId(): string {
  return globalThis.crypto?.randomUUID?.() || `visit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function loadVisitQueue(): VisitOperation[] {
  try {
    const value = JSON.parse(localStorage.getItem(VISIT_QUEUE_KEY) || "[]") as VisitOperation[];
    return Array.isArray(value) ? value.filter((entry) => entry?.requestId && entry?.visitId) : [];
  } catch {
    return [];
  }
}

export function saveVisitQueue(queue: VisitOperation[]): void {
  localStorage.setItem(VISIT_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueVisitOperation(operation: VisitOperation): VisitOperation[] {
  const queue = [operation, ...loadVisitQueue().filter((entry) => entry.requestId !== operation.requestId)]
    .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
  saveVisitQueue(queue);
  return queue;
}

export function removeVisitOperation(requestId: string): VisitOperation[] {
  const queue = loadVisitQueue().filter((entry) => entry.requestId !== requestId);
  saveVisitQueue(queue);
  return queue;
}

export async function captureVisitLocation(): Promise<VisitLocation> {
  let permission = await Geolocation.checkPermissions();
  if (permission.location !== "granted") permission = await Geolocation.requestPermissions({ permissions: ["location"] });
  if (permission.location !== "granted") throw new Error("Precise location permission is required to record a visit.");
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 30_000,
    enableLocationFallback: true,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

function imageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} could not be read as an image.`)); };
    image.src = url;
  });
}

async function compressVisitPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
  const image = await imageFromFile(file);
  const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo processing is unavailable on this device.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.72, 0.6, 0.48]) {
    const value = canvas.toDataURL("image/jpeg", quality);
    if (value.length <= 700_000) return value;
  }
  const reduced = document.createElement("canvas");
  const reducedScale = Math.min(1, 800 / Math.max(canvas.width, canvas.height));
  reduced.width = Math.max(1, Math.round(canvas.width * reducedScale));
  reduced.height = Math.max(1, Math.round(canvas.height * reducedScale));
  const reducedContext = reduced.getContext("2d");
  if (!reducedContext) throw new Error("Photo processing is unavailable on this device.");
  reducedContext.drawImage(canvas, 0, 0, reduced.width, reduced.height);
  const value = reduced.toDataURL("image/jpeg", 0.48);
  if (value.length > 700_000) throw new Error(`${file.name} is still too large for the offline visit queue.`);
  return value;
}

export async function prepareVisitPhotos(files: FileList | null): Promise<string[]> {
  if (!files?.length) return [];
  if (files.length > 3) throw new Error("Attach at most three visit photos.");
  return Promise.all(Array.from(files).map(compressVisitPhoto));
}
