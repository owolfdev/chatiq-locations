"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import {
  LENS_STOPS,
  captureVideoFrame,
  clampZoom,
  deviceIdForLensStop,
  formatZoom,
  highlightedLensStop,
  lensStopAvailable,
  openingZoom,
  preferredRearDeviceId,
  zoomRangeFromCapabilities,
  type LensStop,
  type ZoomRange,
} from "@/lib/vision/live-camera";

type Props = {
  open: boolean;
  shotCount: number;
  maxShots: number;
  latestPreviewUrl: string | null;
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Browser could not open a live camera. Caller may fall back to the system camera. */
  onUnavailable: (message: string) => void;
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function trackZoomRange(track: MediaStreamTrack): ZoomRange | null {
  const caps = track.getCapabilities?.() as
    | { zoom?: { min?: number; max?: number; step?: number } }
    | undefined;
  return zoomRangeFromCapabilities(caps);
}

async function applyTrackZoom(track: MediaStreamTrack, zoom: number) {
  await track.applyConstraints({
    advanced: [{ zoom }],
  } as unknown as MediaTrackConstraints);
}

async function openVideoStream(video: MediaTrackConstraints) {
  return navigator.mediaDevices.getUserMedia({ audio: false, video });
}

export function LiveCameraSheet(props: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rangeRef = useRef<ZoomRange | null>(null);
  const zoomRef = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturing = useRef(false);
  const [ready, setReady] = useState(false);
  const [shownZoom, setShownZoom] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    const owned: { stream: MediaStream | null } = { stream: null };

    async function attach(stream: MediaStream, deviceLabel: string) {
      owned.stream = stream;
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const nextRange = trackZoomRange(track);
      rangeRef.current = nextRange;
      const start = openingZoom(nextRange);
      if (start != null && nextRange) {
        try {
          await applyTrackZoom(track, clampZoom(start, nextRange));
        } catch {
          /* keep the lens the browser already opened */
        }
      }
      const settings = track.getSettings() as { zoom?: number };
      const current =
        typeof settings.zoom === "number" ? settings.zoom : start;
      const ultraNative =
        /ultra/i.test(deviceLabel) && (current == null || current < 1.25);
      const display = ultraNative ? 0.5 : current;
      zoomRef.current = current;
      setShownZoom(display);
      if (cancelled) return;
      setReady(true);
      if (!ultraNative && (display == null || display > 0.75)) {
        setNote("This phone opened without a 0.5 lens. Try the 0.5 button.");
      }
    }

    async function start() {
      setReady(false);
      setNote(null);
      setShownZoom(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        props.onUnavailable("This browser has no in-page camera.");
        return;
      }
      try {
        let stream = await openVideoStream({
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const preferred = preferredRearDeviceId(devices);
        const preferredLabel =
          devices.find((device) => device.deviceId === preferred)?.label ??
          "";
        const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (preferred && preferred !== currentId) {
          stopStream(stream);
          stream = await openVideoStream({
            deviceId: { exact: preferred },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          });
        }
        if (cancelled) {
          stopStream(stream);
          return;
        }
        const openedLabel =
          stream.getVideoTracks()[0]?.label || preferredLabel;
        await attach(stream, openedLabel);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Camera permission denied";
        props.onUnavailable(message);
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (zoomTimer.current) clearTimeout(zoomTimer.current);
      stopStream(owned.stream);
      if (streamRef.current && streamRef.current !== owned.stream) {
        stopStream(streamRef.current);
      }
      streamRef.current = null;
      rangeRef.current = null;
      zoomRef.current = null;
      setReady(false);
    };
    // Callbacks are stable enough for an open/close lifecycle; listing them
    // restarts the camera on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  function rememberZoom(value: number | null) {
    zoomRef.current = value;
    setShownZoom(value);
  }

  async function useStream(stream: MediaStream, displayZoom: number | null) {
    stopStream(streamRef.current);
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => undefined);
    }
    const track = stream.getVideoTracks()[0];
    const nextRange = track ? trackZoomRange(track) : null;
    rangeRef.current = nextRange;
    const settings = track?.getSettings() as { zoom?: number } | undefined;
    const current =
      displayZoom ??
      (typeof settings?.zoom === "number" ? settings.zoom : null);
    rememberZoom(current);
  }

  async function selectStop(stop: LensStop) {
    const track = streamRef.current?.getVideoTracks()[0];
    const currentRange = rangeRef.current;
    const virtualLens =
      /triple|dual/i.test(track?.label ?? "") ||
      (lensStopAvailable(0.5, currentRange) &&
        lensStopAvailable(2, currentRange));
    if (track && virtualLens && currentRange && lensStopAvailable(stop, currentRange)) {
      try {
        await applyTrackZoom(track, clampZoom(stop, currentRange));
        rememberZoom(stop);
        setNote(null);
        return;
      } catch {
        setNote("Could not change zoom.");
        return;
      }
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const deviceId = deviceIdForLensStop(stop, devices);
      const currentId = track?.getSettings().deviceId;
      if (deviceId && deviceId !== currentId) {
        const stream = await openVideoStream({
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        });
        await useStream(stream, stop);
        setNote(null);
        return;
      }
      if (track && currentRange && lensStopAvailable(stop, currentRange)) {
        await applyTrackZoom(track, clampZoom(stop, currentRange));
        rememberZoom(stop);
        setNote(null);
        return;
      }
      setNote(
        stop === 0.5
          ? "This phone has no 0.5 lens."
          : `This phone has no ${formatZoom(stop)} lens.`
      );
    } catch {
      setNote("Could not switch lens.");
    }
  }

  function queuePinchZoom(next: number) {
    const currentRange = rangeRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!currentRange || !track) return;
    const zoom = clampZoom(next, currentRange);
    rememberZoom(zoom);
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => {
      void applyTrackZoom(track, zoom).catch(() => undefined);
    }, 40);
  }

  function pointerDistance() {
    const points = [...pointers.current.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 2 && zoomRef.current != null) {
      pinchRef.current = {
        distance: pointerDistance(),
        zoom: zoomRef.current,
      };
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pinch = pinchRef.current;
    if (!pinch || pointers.current.size < 2 || pinch.distance <= 0) return;
    queuePinchZoom(pinch.zoom * (pointerDistance() / pinch.distance));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  }

  async function shutter() {
    if (capturing.current) return;
    if (props.shotCount >= props.maxShots) return;
    const video = videoRef.current;
    if (!video) return;
    capturing.current = true;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 80);
    try {
      const file = await captureVideoFrame(video);
      props.onCapture(file);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not capture photo");
    } finally {
      capturing.current = false;
    }
  }

  if (!props.open) return null;

  const full = props.shotCount >= props.maxShots;
  const activeStop = highlightedLensStop(shownZoom);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        color: "#fff",
        touchAction: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding:
            "calc(10px + env(safe-area-inset-top)) 12px 10px",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          {props.shotCount} / {props.maxShots}
        </span>
        <button
          type="button"
          onClick={props.onClose}
          style={topBtn}
        >
          Done
        </button>
      </div>

      <div
        style={{ position: "relative", flex: 1, minHeight: 0 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#000",
          }}
        />
        {flash ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.65)",
              pointerEvents: "none",
            }}
          />
        ) : null}
        {!ready ? (
          <p
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "45%",
              textAlign: "center",
              margin: 0,
            }}
          >
            Opening camera…
          </p>
        ) : null}
      </div>

      <div
        style={{
          padding: "12px 16px calc(16px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        {note ? (
          <p style={{ margin: 0, fontSize: 14, color: "#ffcc80" }}>{note}</p>
        ) : null}
        {full ? (
          <p style={{ margin: 0, fontSize: 14 }}>
            Gallery is full. Tap Done, then remove a photo to shoot more.
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 8 }}>
          {LENS_STOPS.map((stop) => {
            const selected = activeStop === stop;
            return (
              <button
                key={stop}
                type="button"
                disabled={!ready}
                onClick={() => void selectStop(stop)}
                style={{
                  ...topBtn,
                  background: selected ? "#fff" : "transparent",
                  color: selected ? "#111" : "#fff",
                  borderColor: "#fff",
                }}
              >
                {formatZoom(stop)}×
              </button>
            );
          })}
        </div>
        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "64px 1fr 64px",
            alignItems: "center",
          }}
        >
          <div>
            {props.latestPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.latestPreviewUrl}
                alt=""
                style={{
                  width: 56,
                  height: 56,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid #fff",
                }}
              />
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Shutter"
            disabled={!ready || full}
            onClick={() => void shutter()}
            style={{
              width: 74,
              height: 74,
              borderRadius: 999,
              justifySelf: "center",
              border: "4px solid #fff",
              background: full ? "#555" : "#fff",
              padding: 0,
            }}
          />
          <span style={{ textAlign: "right", fontSize: 15 }}>
            {shownZoom != null ? `${formatZoom(shownZoom)}×` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

const topBtn: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "#fff",
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.7)",
  borderRadius: 999,
  padding: "8px 14px",
};
