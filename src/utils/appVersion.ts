export interface AppVersionInfo {
  version: string;
  updateContent: string;
}

export interface AppVersionRunner {
  withSuccessHandler(handler: (value: unknown) => void): AppVersionRunner;
  withFailureHandler(handler: () => void): AppVersionRunner;
  getAppVersionInfo(): void;
}

type GoogleAppsScriptGlobal = typeof globalThis & {
  google?: { script?: { run?: AppVersionRunner } };
};

const getDefaultRunner = (): AppVersionRunner | null =>
  (globalThis as GoogleAppsScriptGlobal).google?.script?.run ?? null;

export const normalizeAppVersionInfo = (
  value: unknown,
): AppVersionInfo | null => {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const version =
    typeof record.version === "string" ? record.version.trim() : "";
  const updateContent =
    typeof record.updateContent === "string"
      ? record.updateContent.trim()
      : "";

  return version || updateContent ? { version, updateContent } : null;
};

export const loadAppVersionInfo = (
  runner: AppVersionRunner | null = getDefaultRunner(),
): Promise<AppVersionInfo | null> => {
  if (!runner) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      runner
        .withSuccessHandler((value) => resolve(normalizeAppVersionInfo(value)))
        .withFailureHandler(() => resolve(null))
        .getAppVersionInfo();
    } catch {
      resolve(null);
    }
  });
};
