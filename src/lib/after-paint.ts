export function scheduleAfterPaint(task: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let cancelled = false;
  let frameId: number | null = null;
  let taskId: number | null = null;
  const fallbackId: number | null = window.setTimeout(run, 1200);

  function run(): void {
    if (cancelled) {
      return;
    }

    cancelled = true;
    if (taskId !== null) {
      window.clearTimeout(taskId);
    }
    if (fallbackId !== null) {
      window.clearTimeout(fallbackId);
    }

    task();
  }

  if (typeof window.requestAnimationFrame === "function") {
    frameId = window.requestAnimationFrame(() => {
      taskId = window.setTimeout(run, 0);
    });
  } else {
    taskId = window.setTimeout(run, 0);
  }

  return () => {
    cancelled = true;
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
    if (taskId !== null) {
      window.clearTimeout(taskId);
    }
    if (fallbackId !== null) {
      window.clearTimeout(fallbackId);
    }
  };
}
