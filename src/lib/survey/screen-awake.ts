/**
 * Keep the display on while a long Process run is in front.
 * iOS releases this when the page is hidden, so it is requested again
 * when the mapper comes back. Leaving the app or pressing the side button
 * still locks the phone.
 */
export function holdScreenAwake(): {
  acquired: Promise<boolean>;
  release: () => void;
} {
  let released = false;
  let pending = false;
  let sentinel: WakeLockSentinel | null = null;
  let settled = false;
  let resolveAcquired: (held: boolean) => void = () => {};
  const acquired = new Promise<boolean>((resolve) => {
    resolveAcquired = resolve;
  });

  function settle(held: boolean) {
    if (settled) return;
    settled = true;
    resolveAcquired(held);
  }

  async function acquire() {
    if (released || pending) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      settle(false);
      return;
    }
    if (document.visibilityState !== "visible") return;
    pending = true;
    try {
      const next = await navigator.wakeLock.request("screen");
      if (released) {
        await next.release();
        return;
      }
      sentinel = next;
      settle(true);
      next.addEventListener("release", () => {
        if (sentinel === next) sentinel = null;
        if (!released && document.visibilityState === "visible") {
          void acquire();
        }
      });
    } catch {
      settle(false);
    } finally {
      pending = false;
    }
  }

  function onVisibility() {
    if (document.visibilityState === "visible") void acquire();
  }

  document.addEventListener("visibilitychange", onVisibility);
  void acquire();

  return {
    acquired,
    release() {
      released = true;
      settle(false);
      document.removeEventListener("visibilitychange", onVisibility);
      const current = sentinel;
      sentinel = null;
      if (current) void current.release().catch(() => {});
    },
  };
}
