import {
  createInternalHubVolumePayload,
  INTERNAL_HUB_VOLUME_PATH,
  parseInternalHubVolumeResponse,
  type HubVolumeDefinition,
} from "./internalHubVolume.ts";

export interface InternalHubVolumeApiDependency {
  post(
    path: string,
    payload: ReturnType<typeof createInternalHubVolumePayload>,
    options: { suppressErrorToast: true },
  ): Promise<{ data: unknown }>;
}

export type HubVolumeFetchResult =
  | { hub: HubVolumeDefinition; ok: true; total: number }
  | { hub: HubVolumeDefinition; ok: false; error: string };

const loadApiDependency = async (): Promise<InternalHubVolumeApiDependency> => {
  const { default: apiClient } = await import("./apiClient.ts");
  return {
    post: (path, payload, options) => apiClient.post(path, payload, options),
  };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : "Không thể tải volume của Hub.";

export const fetchInternalHubVolume = async (
  currentStationId: string,
  nextStationId: string,
  dependency?: InternalHubVolumeApiDependency,
): Promise<number> => {
  const client = dependency ?? (await loadApiDependency());
  const response = await client.post(
    INTERNAL_HUB_VOLUME_PATH,
    createInternalHubVolumePayload(currentStationId, nextStationId),
    { suppressErrorToast: true },
  );
  return parseInternalHubVolumeResponse(response.data);
};

export const fetchAllInternalHubVolumes = async (
  currentStationId: string,
  hubs: readonly HubVolumeDefinition[],
  dependency?: InternalHubVolumeApiDependency,
): Promise<HubVolumeFetchResult[]> =>
  Promise.all(
    hubs.map(async (hub): Promise<HubVolumeFetchResult> => {
      try {
        const total = await fetchInternalHubVolume(
          currentStationId,
          hub.id,
          dependency,
        );
        return { hub, ok: true, total };
      } catch (error) {
        return { hub, ok: false, error: errorMessage(error) };
      }
    }),
  );
