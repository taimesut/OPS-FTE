import type { IncidentLogPayload } from "./incidentReport";

export interface IncidentSubmitResult {
  status: "success" | "error" | "unconfirmed";
  message: string;
  incidentId?: string;
}

interface GoogleScriptRunner {
  withSuccessHandler(
    handler: (result: IncidentSubmitResult) => void,
  ): GoogleScriptRunner;
  withFailureHandler(handler: (error: unknown) => void): GoogleScriptRunner;
  submitIncidentReport(payload: IncidentLogPayload): void;
}

declare const google:
  | {
      script?: {
        run?: GoogleScriptRunner;
      };
    }
  | undefined;

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Không thể lưu sự vụ.";
};

const getAppsScriptRunner = (): GoogleScriptRunner | null => {
  if (typeof google === "undefined") return null;
  return google.script?.run ?? null;
};

const submitThroughAppsScript = (
  runner: GoogleScriptRunner,
  payload: IncidentLogPayload,
): Promise<IncidentSubmitResult> =>
  new Promise((resolve, reject) => {
    runner
      .withSuccessHandler((result) => resolve(result))
      .withFailureHandler((error) => reject(new Error(errorMessage(error))))
      .submitIncidentReport(payload);
  });

export const submitIncidentReport = async (
  payload: IncidentLogPayload,
  fallbackUrl: string,
): Promise<IncidentSubmitResult> => {
  const runner = getAppsScriptRunner();
  if (runner) {
    const result = await submitThroughAppsScript(runner, payload);
    if (!result || typeof result.status !== "string") {
      throw new Error("Apps Script trả về kết quả lưu không hợp lệ.");
    }
    return result;
  }

  if (!fallbackUrl.trim()) {
    throw new Error(
      "Chưa cài đặt Link Google Sheet nhận Log và không chạy trong Apps Script.",
    );
  }

  await fetch(fallbackUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
  });

  return {
    status: "unconfirmed",
    message:
      "Đã gửi request tới webhook nhưng trình duyệt không thể xác nhận Google Sheet đã lưu thành công.",
    incidentId: payload.workflow?.incidentId,
  };
};
