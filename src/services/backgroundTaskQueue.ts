interface QueueTaskOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
}

interface QueueTaskResult {
  queued: true;
  taskName: string;
  maxAttempts: number;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function queueTask(taskName: string, task: () => Promise<void>, options: QueueTaskOptions = {}): QueueTaskResult {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? 500);
  const backoffMultiplier = Math.max(1, options.backoffMultiplier ?? 2);

  const run = async () => {
    let attempt = 0;
    let delayMs = initialDelayMs;

    while (attempt < maxAttempts) {
      attempt += 1;

      try {
        await task();
        console.log(`[task:${taskName}] success on attempt ${attempt}/${maxAttempts}`);
        return;
      } catch (error) {
        const message = getErrorMessage(error);
        console.error(`[task:${taskName}] failed on attempt ${attempt}/${maxAttempts}: ${message}`);

        if (attempt >= maxAttempts) {
          console.error(`[task:${taskName}] exhausted retries`);
          return;
        }

        await wait(delayMs);
        delayMs = Math.floor(delayMs * backoffMultiplier);
      }
    }
  };

  setTimeout(() => {
    void run();
  }, 0);

  return {
    queued: true,
    taskName,
    maxAttempts,
  };
}

module.exports = {
  queueTask,
};
