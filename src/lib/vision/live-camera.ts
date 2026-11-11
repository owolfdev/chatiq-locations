/** Zoom stops that match the phone camera lens buttons. */
export const LENS_STOPS = [0.5, 1, 2] as const;

export type LensStop = (typeof LENS_STOPS)[number];

export type ZoomRange = {
  min: number;
  max: number;
  step: number;
};

type ZoomCaps = {
  zoom?: { min?: number; max?: number; step?: number };
};

type VideoInput = {
  kind: string;
  deviceId: string;
  label: string;
};

export function zoomRangeFromCapabilities(
  caps: ZoomCaps | null | undefined
): ZoomRange | null {
  const zoom = caps?.zoom;
  if (!zoom || typeof zoom.min !== "number" || typeof zoom.max !== "number") {
    return null;
  }
  if (!(zoom.max > zoom.min)) return null;
  const step =
    typeof zoom.step === "number" && zoom.step > 0 ? zoom.step : 0.1;
  return { min: zoom.min, max: zoom.max, step };
}

export function lensStopAvailable(
  stop: number,
  range: ZoomRange | null
): boolean {
  if (!range) return false;
  return stop + 0.001 >= range.min && stop - 0.001 <= range.max;
}

/** Widest useful opening: 0.5 when that lens is in range, otherwise the minimum. */
export function openingZoom(range: ZoomRange | null): number | null {
  if (!range) return null;
  if (lensStopAvailable(0.5, range)) return 0.5;
  return range.min;
}

export function clampZoom(value: number, range: ZoomRange): number {
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const steps = Math.round((clamped - range.min) / range.step);
  const snapped = range.min + steps * range.step;
  const bounded = Math.min(range.max, Math.max(range.min, snapped));
  return Math.round(bounded * 1000) / 1000;
}

export function formatZoom(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function highlightedLensStop(zoom: number | null): LensStop | null {
  if (zoom == null || !Number.isFinite(zoom)) return null;
  let best: LensStop | null = null;
  let bestDelta = 0.16;
  for (const stop of LENS_STOPS) {
    const delta = Math.abs(zoom - stop);
    if (delta < bestDelta) {
      best = stop;
      bestDelta = delta;
    }
  }
  return best;
}

function isBackCamera(label: string): boolean {
  const text = label.toLowerCase();
  if (text.includes("front")) return false;
  return (
    text.includes("back") ||
    text.includes("rear") ||
    text.includes("environment")
  );
}

/** Prefer the virtual multi-lens rear camera, then a plain wide lens. */
export function preferredRearDeviceId(devices: VideoInput[]): string | null {
  const backs = devices.filter(
    (device) => device.kind === "videoinput" && isBackCamera(device.label)
  );
  const virtual = backs.find((device) =>
    /triple|dual wide|dual camera/.test(device.label.toLowerCase())
  );
  if (virtual) return virtual.deviceId;
  const wide = backs.find((device) => {
    const text = device.label.toLowerCase();
    return !text.includes("ultra") && !text.includes("tele");
  });
  return wide?.deviceId ?? backs[0]?.deviceId ?? null;
}

/**
 * When the current track cannot reach a stop, another listed rear lens might.
 * Returns null when the stop should be done with zoom on the current track.
 */
export function deviceIdForLensStop(
  stop: LensStop,
  devices: VideoInput[]
): string | null {
  const backs = devices.filter(
    (device) => device.kind === "videoinput" && isBackCamera(device.label)
  );
  if (stop === 0.5) {
    return (
      backs.find((device) => /ultra/.test(device.label.toLowerCase()))
        ?.deviceId ?? null
    );
  }
  if (stop === 2) {
    return (
      backs.find((device) => /tele/.test(device.label.toLowerCase()))
        ?.deviceId ?? null
    );
  }
  return (
    backs.find((device) => {
      const text = device.label.toLowerCase();
      return !text.includes("ultra") && !text.includes("tele");
    })?.deviceId ?? null
  );
}

export function captureVideoFrame(video: HTMLVideoElement): Promise<File> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    return Promise.reject(new Error("Camera is not ready"));
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not capture photo"));
  ctx.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not capture photo"));
          return;
        }
        resolve(
          new File([blob], `shot-${Date.now()}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          })
        );
      },
      "image/jpeg",
      0.85
    );
  });
}
