export type PdaUploadStatus = "QUEUED" | "UPLOADING" | "COMPLETED" | "FAILED";

export interface PdaUploadJobSnapshot {
  pdaName: string;
  status: PdaUploadStatus;
  attempt: number;
  error: string | null;
}

export interface PdaUploadQueueOptions<T> {
  maxConcurrency: number;
  retryDelays: readonly number[];
  upload: (pdaName: string, blob: Blob) => Promise<T>;
  onSuccess: (pdaName: string, result: T) => void;
  wait?: (milliseconds: number) => Promise<void>;
}

interface PdaUploadJob {
  pdaName: string;
  status: PdaUploadStatus;
  attempt: number;
  error: string | null;
  blob: Blob | null;
  pendingReplacement: Blob | null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Không thể tải ảnh PDA.";
}

export class PdaUploadQueue<T> {
  private readonly maxConcurrency: number;
  private readonly retryDelays: readonly number[];
  private readonly upload: PdaUploadQueueOptions<T>["upload"];
  private readonly onSuccess: PdaUploadQueueOptions<T>["onSuccess"];
  private readonly waitOverride: PdaUploadQueueOptions<T>["wait"];
  private readonly jobs = new Map<string, PdaUploadJob>();
  private readonly listeners = new Set<() => void>();
  private readonly retryTimers = new Map<ReturnType<typeof globalThis.setTimeout>, () => void>();
  private readonly disposedSignal: Promise<void>;
  private resolveDisposed!: () => void;
  private snapshot: readonly PdaUploadJobSnapshot[] = Object.freeze([]);
  private activeCount = 0;
  private disposed = false;

  constructor(options: PdaUploadQueueOptions<T>) {
    if (!Number.isInteger(options.maxConcurrency) || options.maxConcurrency < 1) {
      throw new Error("maxConcurrency must be a positive integer.");
    }
    if (options.retryDelays.some((delay) => !Number.isFinite(delay) || delay < 0)) {
      throw new Error("retryDelays must contain non-negative finite values.");
    }
    this.maxConcurrency = options.maxConcurrency;
    this.retryDelays = [...options.retryDelays];
    this.upload = options.upload;
    this.onSuccess = options.onSuccess;
    this.waitOverride = options.wait;
    this.disposedSignal = new Promise<void>((resolve) => {
      this.resolveDisposed = resolve;
    });
  }

  enqueue(pdaName: string, blob: Blob): void {
    if (this.disposed) return;
    const normalizedName = pdaName.trim();
    if (!normalizedName) throw new Error("pdaName must not be blank.");
    if (!(blob instanceof Blob) || blob.size === 0) throw new Error("blob must not be empty.");

    const existing = this.jobs.get(normalizedName);
    if (existing?.status === "UPLOADING") {
      existing.pendingReplacement = blob;
      this.emit();
      return;
    }

    if (existing) {
      existing.blob = blob;
      existing.pendingReplacement = null;
      existing.status = "QUEUED";
      existing.attempt = 0;
      existing.error = null;
    } else {
      this.jobs.set(normalizedName, {
        pdaName: normalizedName,
        status: "QUEUED",
        attempt: 0,
        error: null,
        blob,
        pendingReplacement: null,
      });
    }
    this.emit();
    this.pump();
  }

  retry(pdaName: string): void {
    if (this.disposed) return;
    const job = this.jobs.get(pdaName.trim());
    if (!job || job.status !== "FAILED" || !job.blob) return;
    job.status = "QUEUED";
    job.attempt = 0;
    job.error = null;
    this.emit();
    this.pump();
  }

  getSnapshot(): readonly PdaUploadJobSnapshot[] {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resolveDisposed();
    for (const cancel of [...this.retryTimers.values()]) cancel();
    this.retryTimers.clear();
    for (const job of this.jobs.values()) {
      job.blob = null;
      job.pendingReplacement = null;
    }
    this.jobs.clear();
    this.snapshot = Object.freeze([]);
    this.listeners.clear();
  }

  private emit() {
    if (this.disposed) return;
    this.snapshot = Object.freeze(Array.from(this.jobs.values(), (job) =>
      Object.freeze({
        pdaName: job.pdaName,
        status: job.status,
        attempt: job.attempt,
        error: job.error,
      })));
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // A subscriber must not corrupt queue scheduling.
      }
    }
  }

  private pump() {
    if (this.disposed) return;
    while (this.activeCount < this.maxConcurrency) {
      const job = Array.from(this.jobs.values()).find(
        (candidate) => candidate.status === "QUEUED" && candidate.blob,
      );
      if (!job) return;
      job.status = "UPLOADING";
      job.attempt = 1;
      job.error = null;
      this.activeCount += 1;
      this.emit();
      void this.run(job);
    }
  }

  private queueReplacement(job: PdaUploadJob) {
    job.blob = job.pendingReplacement;
    job.pendingReplacement = null;
    job.status = "QUEUED";
    job.attempt = 0;
    job.error = null;
    this.activeCount -= 1;
    this.emit();
    this.pump();
  }

  private async uploadAttempt(job: PdaUploadJob) {
    const uploadBlob = job.blob;
    if (!uploadBlob) throw new Error("Ảnh PDA không còn khả dụng.");
    return this.upload(job.pdaName, uploadBlob);
  }

  private waitForRetry(milliseconds: number) {
    if (this.waitOverride) {
      return Promise.race([this.waitOverride(milliseconds), this.disposedSignal]);
    }
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        this.retryTimers.delete(timer);
        resolve();
      };
      const timer = globalThis.setTimeout(finish, milliseconds);
      this.retryTimers.set(timer, finish);
    });
  }

  private async run(job: PdaUploadJob) {
    const totalAttempts = this.retryDelays.length + 1;
    while (!this.disposed) {
      try {
        const result = await this.uploadAttempt(job);
        if (this.disposed) break;
        if (job.pendingReplacement) {
          this.queueReplacement(job);
          return;
        }
        job.blob = null;
        job.status = "COMPLETED";
        job.error = null;
        this.activeCount -= 1;
        this.emit();
        try {
          this.onSuccess(job.pdaName, result);
        } catch {
          // The upload is already complete; callback failures must not retry it.
        }
        this.pump();
        return;
      } catch (error) {
        if (this.disposed) break;
        if (job.pendingReplacement) {
          this.queueReplacement(job);
          return;
        }
        if (job.attempt >= totalAttempts) {
          job.status = "FAILED";
          job.error = getErrorMessage(error);
          this.activeCount -= 1;
          this.emit();
          this.pump();
          return;
        }
        await this.waitForRetry(this.retryDelays[job.attempt - 1]);
        if (this.disposed) break;
        if (job.pendingReplacement) {
          this.queueReplacement(job);
          return;
        }
        job.attempt += 1;
        job.error = null;
        this.emit();
      }
    }
    this.activeCount -= 1;
  }
}
