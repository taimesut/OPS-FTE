import assert from "node:assert/strict";
import test from "node:test";

import { PdaUploadQueue } from "../src/utils/pdaUploadQueue.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function until(predicate: () => boolean) {
  for (let index = 0; index < 30; index += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail("Timed out waiting for queue state");
}

function blob(label: string) {
  return new Blob([label], { type: "image/jpeg" });
}

test("runs exactly two uploads and releases a slot for the third", async () => {
  const pending = [deferred<string>(), deferred<string>(), deferred<string>()];
  const starts: string[] = [];
  const queue = new PdaUploadQueue<string>({
    maxConcurrency: 2,
    retryDelays: [],
    upload: (name) => {
      starts.push(name);
      return pending[starts.length - 1].promise;
    },
    onSuccess() {},
  });

  queue.enqueue("PDA01", blob("one"));
  queue.enqueue("PDA02", blob("two"));
  queue.enqueue("PDA03", blob("three"));
  assert.deepEqual(starts, ["PDA01", "PDA02"]);
  assert.equal(queue.getSnapshot().find((job) => job.pdaName === "PDA03")?.status, "QUEUED");

  pending[0].resolve("one");
  await until(() => starts.length === 3);
  assert.deepEqual(starts, ["PDA01", "PDA02", "PDA03"]);
});

test("retries three times with exact delays before exposing final failure", async () => {
  const delays: number[] = [];
  let calls = 0;
  const queue = new PdaUploadQueue<string>({
    maxConcurrency: 2,
    retryDelays: [500, 1500, 3500],
    upload: async () => { calls += 1; throw new Error(`failure-${calls}`); },
    onSuccess() {},
    wait: async (milliseconds) => { delays.push(milliseconds); },
  });

  queue.enqueue("PDA01", blob("retry"));
  await until(() => queue.getSnapshot()[0]?.status === "FAILED");
  assert.equal(calls, 4);
  assert.deepEqual(delays, [500, 1500, 3500]);
  assert.deepEqual(queue.getSnapshot()[0], {
    pdaName: "PDA01",
    status: "FAILED",
    attempt: 4,
    error: "failure-4",
  });
});

test("manual retry restarts at attempt one and success notifies once", async () => {
  const results: string[] = [];
  let shouldFail = true;
  let observedAttemptAfterRetry = 0;
  const queue = new PdaUploadQueue<string>({
    maxConcurrency: 1,
    retryDelays: [],
    upload: async (name) => {
      observedAttemptAfterRetry = queue.getSnapshot().find((job) => job.pdaName === name)?.attempt ?? 0;
      if (shouldFail) throw new Error("offline");
      return "uploaded";
    },
    onSuccess: (_name, result) => results.push(result),
  });
  queue.enqueue("PDA01", blob("retained"));
  await until(() => queue.getSnapshot()[0]?.status === "FAILED");
  shouldFail = false;
  queue.retry("PDA01");
  await until(() => queue.getSnapshot()[0]?.status === "COMPLETED");
  assert.equal(observedAttemptAfterRetry, 1);
  assert.deepEqual(results, ["uploaded"]);
});

test("new capture replaces queued and failed data", async () => {
  const blocker = deferred<string>();
  const uploadedBodies: string[] = [];
  let failPda02 = true;
  const queue = new PdaUploadQueue<string>({
    maxConcurrency: 1,
    retryDelays: [],
    upload: async (name, image) => {
      if (name === "PDA01") return blocker.promise;
      uploadedBodies.push(await image.text());
      if (failPda02) throw new Error("failed");
      return "ok";
    },
    onSuccess() {},
  });
  queue.enqueue("PDA01", blob("blocking"));
  queue.enqueue("PDA02", blob("queued-old"));
  queue.enqueue("PDA02", blob("queued-new"));
  blocker.resolve("done");
  await until(() => queue.getSnapshot().find((job) => job.pdaName === "PDA02")?.status === "FAILED");
  assert.deepEqual(uploadedBodies, ["queued-new"]);

  failPda02 = false;
  queue.enqueue("PDA02", blob("failed-replacement"));
  await until(() => queue.getSnapshot().find((job) => job.pdaName === "PDA02")?.status === "COMPLETED");
  assert.deepEqual(uploadedBodies, ["queued-new", "failed-replacement"]);
});

test("latest capture during upload becomes the next version", async () => {
  const first = deferred<string>();
  const bodies: string[] = [];
  const successes: string[] = [];
  const queue = new PdaUploadQueue<string>({
    maxConcurrency: 1,
    retryDelays: [],
    upload: async (_name, image) => {
      const body = await image.text();
      bodies.push(body);
      if (body === "first") return first.promise;
      return body;
    },
    onSuccess: (_name, result) => successes.push(result),
  });
  queue.enqueue("PDA01", blob("first"));
  await until(() => bodies.length === 1);
  queue.enqueue("PDA01", blob("replacement-old"));
  queue.enqueue("PDA01", blob("replacement-latest"));
  first.resolve("stale-result");
  await until(() => queue.getSnapshot()[0]?.status === "COMPLETED");
  assert.deepEqual(bodies, ["first", "replacement-latest"]);
  assert.deepEqual(successes, ["replacement-latest"]);
});

test("snapshots are immutable copies and mutations notify subscribers", async () => {
  const upload = deferred<string>();
  let notifications = 0;
  const queue = new PdaUploadQueue<string>({
    maxConcurrency: 1,
    retryDelays: [],
    upload: () => upload.promise,
    onSuccess() {},
  });
  const unsubscribe = queue.subscribe(() => { notifications += 1; });
  queue.enqueue("PDA01", blob("one"));
  const before = queue.getSnapshot();
  assert.equal(Object.isFrozen(before), true);
  assert.equal(Object.isFrozen(before[0]), true);
  assert.equal(queue.getSnapshot(), before);
  queue.enqueue("PDA01", blob("replacement"));
  const after = queue.getSnapshot();
  assert.notEqual(after, before);
  assert.notEqual(after[0], before[0]);
  assert.ok(notifications >= 3);
  unsubscribe();
  upload.resolve("ignored-stale");
});

test("dispose clears work and prevents queued or replacement uploads", async () => {
  const first = deferred<string>();
  const starts: string[] = [];
  let successes = 0;
  const queue = new PdaUploadQueue<string>({
    maxConcurrency: 1,
    retryDelays: [],
    upload: (name) => { starts.push(name); return first.promise; },
    onSuccess: () => { successes += 1; },
  });
  let notifications = 0;
  queue.subscribe(() => { notifications += 1; });
  queue.enqueue("PDA01", blob("one"));
  queue.enqueue("PDA01", blob("replacement"));
  queue.enqueue("PDA02", blob("queued"));
  queue.dispose();
  const notificationsAtDispose = notifications;
  assert.deepEqual(queue.getSnapshot(), []);
  queue.enqueue("PDA03", blob("ignored"));
  first.resolve("done");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(starts, ["PDA01"]);
  assert.equal(successes, 0);
  assert.equal(notifications, notificationsAtDispose);
});

test("dispose cancels a retry backoff without retaining an active generation", async () => {
  const retryWait = deferred<void>();
  let uploadCalls = 0;
  let waitCalls = 0;
  const queue = new PdaUploadQueue<string>({
    maxConcurrency: 1,
    retryDelays: [3500],
    upload: async () => {
      uploadCalls += 1;
      throw new Error("offline");
    },
    onSuccess() {},
    wait: () => {
      waitCalls += 1;
      return retryWait.promise;
    },
  });

  queue.enqueue("PDA01", blob("must-be-released"));
  await until(() => waitCalls === 1);
  assert.equal((queue as unknown as { activeCount: number }).activeCount, 1);
  queue.dispose();
  await until(() => (queue as unknown as { activeCount: number }).activeCount === 0);
  assert.equal(uploadCalls, 1);
  assert.deepEqual(queue.getSnapshot(), []);

  retryWait.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(uploadCalls, 1);
});
