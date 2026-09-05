import {
  createLoadingPath,
  createTripDetailPath,
  createTripSearchPath,
  parseLoadingPage,
  parseTripDetailResponse,
  parseTripSearchResponse,
  type LoadingKind,
  type TripDetails,
  type TripSummary,
} from "./incidentReport.ts";

export interface IncidentReportApiDependency {
  get(
    path: string,
    options: { suppressErrorToast: true },
  ): Promise<{ data: unknown }>;
}

export interface LoadingFetchResult {
  codes: string[];
  invalidCount: number;
  reportedTotal: number;
}

const loadApiDependency = async (): Promise<IncidentReportApiDependency> => {
  const { default: apiClient } = await import("../../utils/apiClient.ts");
  return {
    get: (path, options) => apiClient.get(path, options),
  };
};

const clientFor = async (
  dependency?: IncidentReportApiDependency,
): Promise<IncidentReportApiDependency> =>
  dependency ?? (await loadApiDependency());

export const searchTrips = async (
  raw: string,
  dependency?: IncidentReportApiDependency,
): Promise<TripSummary[]> => {
  const client = await clientFor(dependency);
  const response = await client.get(createTripSearchPath(raw), {
    suppressErrorToast: true,
  });
  return parseTripSearchResponse(response.data);
};

export const fetchTripDetails = async (
  tripId: number,
  dependency?: IncidentReportApiDependency,
): Promise<TripDetails> => {
  const client = await clientFor(dependency);
  const response = await client.get(createTripDetailPath(tripId), {
    suppressErrorToast: true,
  });
  return parseTripDetailResponse(response.data);
};

export const fetchAllLoadingItems = async (
  kind: LoadingKind,
  tripId: number,
  sequence: number,
  dependency?: IncidentReportApiDependency,
): Promise<LoadingFetchResult> => {
  const client = await clientFor(dependency);
  const codes: string[] = [];
  const seenResponsePages = new Set<number>();
  let invalidCount = 0;
  let reportedTotal = 0;
  let processedItems = 0;

  for (let pageNo = 1; pageNo <= 10_000; pageNo += 1) {
    const response = await client.get(
      createLoadingPath(kind, tripId, sequence, pageNo),
      { suppressErrorToast: true },
    );
    const page = parseLoadingPage(response.data);
    if (seenResponsePages.has(page.pageNo)) break;
    seenResponsePages.add(page.pageNo);

    reportedTotal = page.total;
    processedItems += page.rawItemCount;
    codes.push(...page.codes);
    invalidCount += page.invalidCount;

    if (page.rawItemCount === 0 || processedItems >= page.total) break;
    const lastPage = Math.max(1, Math.ceil(page.total / page.count));
    if (pageNo >= lastPage) break;
  }

  return { codes, invalidCount, reportedTotal };
};
