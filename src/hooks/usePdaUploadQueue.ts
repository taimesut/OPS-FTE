import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import type { PdaHandoverItem } from "../utils/pdaHandover";
import { uploadPdaPhoto } from "../utils/pdaHandoverApi";
import {
  PdaUploadQueue,
  type PdaUploadJobSnapshot,
} from "../utils/pdaUploadQueue";

const EMPTY_JOBS: readonly PdaUploadJobSnapshot[] = Object.freeze([]);
const RETRY_DELAYS = [500, 1500, 3500] as const;

class PdaUploadQueueStore {
  private queue: PdaUploadQueue<PdaHandoverItem> | null = null;
  private unsubscribeQueue: (() => void) | null = null;
  private snapshot: readonly PdaUploadJobSnapshot[] = EMPTY_JOBS;
  private readonly listeners = new Set<() => void>();

  attach(queue: PdaUploadQueue<PdaHandoverItem>) {
    this.unsubscribeQueue?.();
    this.queue = queue;
    this.snapshot = queue.getSnapshot();
    this.unsubscribeQueue = queue.subscribe(() => {
      this.snapshot = queue.getSnapshot();
      this.emit();
    });
    this.emit();
  }

  detach(queue: PdaUploadQueue<PdaHandoverItem>) {
    if (this.queue !== queue) return;
    this.unsubscribeQueue?.();
    this.unsubscribeQueue = null;
    this.queue = null;
    this.snapshot = EMPTY_JOBS;
    this.emit();
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  enqueue(pdaName: string, blob: Blob) {
    this.queue?.enqueue(pdaName, blob);
  }

  retry(pdaName: string) {
    this.queue?.retry(pdaName);
  }

  private emit() {
    for (const listener of [...this.listeners]) listener();
  }
}

function readJpegAsDataUrl(blob: Blob): Promise<string> {
  if (blob.type !== "image/jpeg" || blob.size <= 0) {
    return Promise.reject(new Error("Ảnh PDA phải là JPEG hợp lệ."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (
        typeof result !== "string" ||
        !result.startsWith("data:image/jpeg;base64,")
      ) {
        reject(new Error("Không thể chuyển ảnh PDA để tải lên."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Không thể đọc ảnh PDA."));
    reader.readAsDataURL(blob);
  });
}

async function uploadBlob(
  sessionId: string,
  pdaName: string,
  blob: Blob,
): Promise<PdaHandoverItem> {
  const dataUrl = await readJpegAsDataUrl(blob);
  return uploadPdaPhoto(sessionId, pdaName, dataUrl);
}

export function usePdaUploadQueue(options: {
  sessionId: string | null;
  onUploaded: (item: PdaHandoverItem) => void;
}): {
  jobs: readonly PdaUploadJobSnapshot[];
  enqueue: (pdaName: string, blob: Blob) => void;
  retry: (pdaName: string) => void;
  uploadingCount: number;
  hasBlockingJobs: boolean;
} {
  const { sessionId, onUploaded } = options;
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);
  const store = useMemo(() => new PdaUploadQueueStore(), []);

  useEffect(() => {
    if (!sessionId) return;
    const queue = new PdaUploadQueue<PdaHandoverItem>({
      maxConcurrency: 2,
      retryDelays: RETRY_DELAYS,
      upload: (pdaName, blob) => uploadBlob(sessionId, pdaName, blob),
      onSuccess: (_pdaName, item) => onUploadedRef.current(item),
    });
    store.attach(queue);
    return () => {
      store.detach(queue);
      queue.dispose();
    };
  }, [sessionId, store]);

  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  );
  const getSnapshot = useCallback(
    () => store.getSnapshot(),
    [store],
  );
  const jobs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const enqueue = useCallback(
    (pdaName: string, blob: Blob) => store.enqueue(pdaName, blob),
    [store],
  );
  const retry = useCallback(
    (pdaName: string) => store.retry(pdaName),
    [store],
  );

  const uploadingCount = jobs.reduce(
    (count, job) => count + (job.status === "UPLOADING" ? 1 : 0),
    0,
  );
  const hasBlockingJobs = jobs.some(
    (job) => job.status === "QUEUED" || job.status === "UPLOADING" || job.status === "FAILED",
  );

  return {
    jobs,
    enqueue,
    retry,
    uploadingCount,
    hasBlockingJobs,
  };
}
