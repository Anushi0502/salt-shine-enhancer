import { scheduleAfterPaint } from "@/lib/after-paint";

describe("scheduleAfterPaint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the next scheduled task before running", () => {
    const task = vi.fn();

    scheduleAfterPaint(task);

    expect(task).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("cancels the scheduled task during cleanup", () => {
    const task = vi.fn();
    const cancel = scheduleAfterPaint(task);

    cancel();
    vi.runAllTimers();

    expect(task).not.toHaveBeenCalled();
  });
});
