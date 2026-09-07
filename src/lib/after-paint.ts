export function scheduleAfterPaint(task: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let cancelled = false;
  let frameId: number | null = null;
  let idleId: number | null = null;
  let taskId: number | null = null;
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  const fallbackId: number | null = window.setTimeout(run, 1_500);

  function run(): void {
    if (cancelled) {
      return;
    }

    cancelled = true;
    if (taskId !== null) {
      window.clearTimeout(taskId);
    }
    if (idleId !== null && idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(idleId);
    }
    if (fallbackId !== null) {
      window.clearTimeout(fallbackId);
    }

    task();
  }

  if (typeof window.requestAnimationFrame === "function") {
    frameId = window.requestAnimationFrame(() => {
      if (idleWindow.requestIdleCallback) {
        idleId = idleWindow.requestIdleCallback(run, { timeout: 1_200 });
      } else {
        taskId = window.setTimeout(run, 200);
      }
    });
  } else {
    taskId = window.setTimeout(run, 200);
  }

  return () => {
    cancelled = true;
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
    if (taskId !== null) {
      window.clearTimeout(taskId);
    }
    if (idleId !== null && idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(idleId);
    }
    if (fallbackId !== null) {
      window.clearTimeout(fallbackId);
    }
  };
}
