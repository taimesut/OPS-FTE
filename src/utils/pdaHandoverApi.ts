import type {
  PdaHandoverItem,
  PdaHandoverSession,
  PdaShift,
} from "./pdaHandover";

const GAS_CONNECTION_ERROR = "Không thể kết nối Google Apps Script.";

interface GasScriptRunner {
  withSuccessHandler(handler: (value: unknown) => void): GasScriptRunner;
  withFailureHandler(handler: (error: unknown) => void): GasScriptRunner;
  getPdaHandoverBootstrap(date: string, shift: PdaShift): void;
  validatePdaQr(sessionId: string, secret: string): void;
  uploadPdaEvidence(sessionId: string, pdaName: string, dataUrl: string): void;
  submitPdaHandover(sessionId: string): void;
}

declare global {
  interface Window {
    google?: {
      script?: {
        run?: GasScriptRunner;
      };
    };
  }
}

type GasMethod =
  | "getPdaHandoverBootstrap"
  | "validatePdaQr"
  | "uploadPdaEvidence"
  | "submitPdaHandover";

export function getGasErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }
  return GAS_CONNECTION_ERROR;
}

function invokeGas(
  runner: GasScriptRunner,
  method: GasMethod,
  args: readonly unknown[],
): void {
  switch (method) {
    case "getPdaHandoverBootstrap":
      runner.getPdaHandoverBootstrap(args[0] as string, args[1] as PdaShift);
      return;
    case "validatePdaQr":
      runner.validatePdaQr(args[0] as string, args[1] as string);
      return;
    case "uploadPdaEvidence":
      runner.uploadPdaEvidence(
        args[0] as string,
        args[1] as string,
        args[2] as string,
      );
      return;
    case "submitPdaHandover":
      runner.submitPdaHandover(args[0] as string);
  }
}

function runGas<T>(method: GasMethod, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const runner = typeof window === "undefined" ? undefined : window.google?.script?.run;
    if (!runner) {
      reject(
        new Error(
          "Chức năng bàn giao PDA chỉ hoạt động trên Google Apps Script.",
        ),
      );
      return;
    }

    const configuredRunner = runner
      .withSuccessHandler((value: unknown) => resolve(value as T))
      .withFailureHandler((error: unknown) =>
        reject(new Error(getGasErrorMessage(error))),
      );
    invokeGas(configuredRunner, method, args);
  });
}

export function fetchPdaHandover(
  date: string,
  shift: PdaShift,
): Promise<PdaHandoverSession> {
  return runGas("getPdaHandoverBootstrap", date, shift);
}

export function validatePdaScan(
  sessionId: string,
  secret: string,
): Promise<PdaHandoverItem> {
  return runGas("validatePdaQr", sessionId, secret);
}

export function uploadPdaPhoto(
  sessionId: string,
  pdaName: string,
  dataUrl: string,
): Promise<PdaHandoverItem> {
  return runGas("uploadPdaEvidence", sessionId, pdaName, dataUrl);
}

export function submitPdaSession(
  sessionId: string,
): Promise<PdaHandoverSession> {
  return runGas("submitPdaHandover", sessionId);
}
