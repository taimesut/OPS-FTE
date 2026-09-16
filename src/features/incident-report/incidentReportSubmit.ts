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

interface GmXmlHttpResponse {
  status: number;
  statusText?: string;
  responseText: string;
  finalUrl?: string;
}

interface GmXmlHttpRequestDetails {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  data: string;
  timeout: number;
  onload: (response: GmXmlHttpResponse) => void;
  onerror: (response: GmXmlHttpResponse) => void;
  ontimeout: () => void;
}

type GmXmlHttpRequest = (details: GmXmlHttpRequestDetails) => unknown;

declare const google:
  | {
      script?: {
        run?: GoogleScriptRunner;
      };
    }
  | undefined;

declare const GM_xmlhttpRequest: GmXmlHttpRequest | undefined;

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

const getUserscriptRequest = (): GmXmlHttpRequest | null => {
  if (typeof GM_xmlhttpRequest !== "function") return null;
  return GM_xmlhttpRequest;
};

const parseSubmitResult = (raw: string): IncidentSubmitResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Apps Script không trả về JSON hợp lệ. Kiểm tra quyền truy cập và URL /exec.",
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Apps Script trả về kết quả lưu không hợp lệ.");
  }

  const record = parsed as Record<string, unknown>;
  const status = record.status;
  if (status !== "success" && status !== "error") {
    throw new Error("Apps Script trả về trạng thái lưu không hợp lệ.");
  }

  return {
    status,
    message:
      typeof record.message === "string" && record.message.trim()
        ? record.message.trim()
        : status === "success"
          ? "Đã lưu sự vụ thành công."
          : "Không thể lưu sự vụ.",
    incidentId:
      typeof record.incidentId === "string" && record.incidentId.trim()
        ? record.incidentId.trim()
        : undefined,
  };
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

const submitThroughUserscript = (
  request: GmXmlHttpRequest,
  url: string,
  payload: IncidentLogPayload,
): Promise<IncidentSubmitResult> =>
  new Promise((resolve, reject) => {
    request({
      method: "POST",
      url,
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
      },
      data: JSON.stringify(payload),
      timeout: 30000,
      onload: (response) => {
        if (response.status < 200 || response.status >= 300) {
          reject(
            new Error(
              `Apps Script phản hồi HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
            ),
          );
          return;
        }

        try {
          resolve(parseSubmitResult(response.responseText));
        } catch (error) {
          reject(error);
        }
      },
      onerror: (response) => {
        reject(
          new Error(
            response.status
              ? `Không thể kết nối Apps Script (HTTP ${response.status}).`
              : "Không thể kết nối Apps Script. Kiểm tra URL webhook và quyền @connect.",
          ),
        );
      },
      ontimeout: () => {
        reject(new Error("Apps Script phản hồi quá lâu. Vui lòng thử lại."));
      },
    });
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

  const url = fallbackUrl.trim();
  if (!url) {
    throw new Error(
      "Chưa cài đặt Link Google Sheet nhận Log và không chạy trong Apps Script.",
    );
  }

  const userscriptRequest = getUserscriptRequest();
  if (userscriptRequest) {
    return submitThroughUserscript(userscriptRequest, url, payload);
  }

  await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
  });

  return {
    status: "unconfirmed",
    message:
      "Đã gửi request tới webhook nhưng userscript manager không cung cấp GM_xmlhttpRequest để xác nhận kết quả.",
    incidentId: payload.workflow?.incidentId,
  };
};
