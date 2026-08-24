import type { AppConfig } from "./config.ts";
import {
  normalizeStationCatalog,
  normalizeStationHubs,
  type StationCatalogHub,
  type StationCatalogSoc,
} from "./stationCatalog.ts";

export type ConfiguredSocReference = Pick<
  Partial<AppConfig>,
  "soc" | "soc_id" | "soc_code"
>;

export interface BuildStationConfigInput {
  previousConfig: AppConfig;
  catalog: readonly StationCatalogSoc[];
  currentSocId: string;
  hubs: readonly StationCatalogHub[];
  groupSocs: Record<string, string[]>;
  cookies: string;
  logUrl: string;
}

const normalizeKey = (value: unknown): string =>
  typeof value === "string"
    ? value.trim().toLocaleLowerCase("vi-VN")
    : "";

export const findConfiguredSocId = (
  config: ConfiguredSocReference,
  catalog: readonly StationCatalogSoc[],
): string => {
  const configuredId = config.soc_id?.trim();
  if (configuredId) {
    const byId = catalog.find(({ id }) => id === configuredId);
    if (byId) return byId.id;
  }

  const configuredCode = normalizeKey(config.soc_code);
  if (configuredCode) {
    const byCode = catalog.find(
      ({ stationCode }) => normalizeKey(stationCode) === configuredCode,
    );
    if (byCode) return byCode.id;
  }

  const configuredName = normalizeKey(config.soc);
  if (configuredName) {
    const byName = catalog.find(
      ({ stationName }) => normalizeKey(stationName) === configuredName,
    );
    if (byName) return byName.id;
  }

  return "";
};

export const getExternalSocs = (
  catalog: readonly StationCatalogSoc[],
  currentSocId: string,
): StationCatalogSoc[] => catalog.filter(({ id }) => id !== currentSocId);

const createExternalNameMap = (
  externalSocs: readonly StationCatalogSoc[],
): Map<string, string> =>
  new Map(
    externalSocs.map(({ stationName }) => [normalizeKey(stationName), stationName]),
  );

const getGroupRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const orderGroupMembers = (
  representative: string,
  selectedNames: Set<string>,
  externalSocs: readonly StationCatalogSoc[],
): string[] => [
  representative,
  ...externalSocs
    .map(({ stationName }) => stationName)
    .filter(
      (stationName) =>
        stationName !== representative && selectedNames.has(stationName),
    ),
];

export const reconcileGroupSocs = (
  value: unknown,
  externalSocs: readonly StationCatalogSoc[],
): Record<string, string[]> => {
  const input = getGroupRecord(value);
  const canonicalNames = createExternalNameMap(externalSocs);
  const inputByRepresentative = new Map(
    Object.entries(input).map(([name, members]) => [normalizeKey(name), members]),
  );
  const result: Record<string, string[]> = {};

  for (const { stationName: representative } of externalSocs) {
    const rawMembers = inputByRepresentative.get(normalizeKey(representative));
    if (!Array.isArray(rawMembers)) continue;

    const selectedNames = new Set<string>([representative]);
    for (const rawMember of rawMembers) {
      const canonicalName = canonicalNames.get(normalizeKey(rawMember));
      if (canonicalName) selectedNames.add(canonicalName);
    }

    const members = orderGroupMembers(
      representative,
      selectedNames,
      externalSocs,
    );
    if (members.length > 1) result[representative] = members;
  }

  return result;
};

export const validateGroupSocs = (
  groups: Record<string, string[]>,
  externalSocs: readonly StationCatalogSoc[],
): Record<string, string[]> => {
  const canonicalNames = createExternalNameMap(externalSocs);
  const seenRepresentatives = new Set<string>();

  for (const [rawRepresentative, rawMembers] of Object.entries(groups)) {
    const representative = canonicalNames.get(normalizeKey(rawRepresentative));
    if (!representative) {
      throw new Error(
        `SOC "${rawRepresentative}" không thuộc danh sách SOC ngoại tỉnh.`,
      );
    }
    if (seenRepresentatives.has(representative)) {
      throw new Error(`SOC đại diện "${representative}" bị trùng.`);
    }
    seenRepresentatives.add(representative);

    if (!Array.isArray(rawMembers)) {
      throw new Error(`Nhóm "${representative}" không có danh sách thành viên hợp lệ.`);
    }
    for (const rawMember of rawMembers) {
      const member =
        typeof rawMember === "string"
          ? canonicalNames.get(normalizeKey(rawMember))
          : undefined;
      if (!member) {
        throw new Error(
          `SOC "${String(rawMember)}" không thuộc danh sách SOC ngoại tỉnh.`,
        );
      }
    }
  }

  return reconcileGroupSocs(groups, externalSocs);
};

export const buildStationConfig = (
  input: BuildStationConfigInput,
): AppConfig => {
  const catalog = normalizeStationCatalog([...input.catalog]);
  const current = catalog.find(({ id }) => id === input.currentSocId.trim());
  if (!current) {
    throw new Error("SOC hiện tại không còn tồn tại trong LIST SOC.");
  }

  const hubs = normalizeStationHubs([...input.hubs]);
  const externalSocs = getExternalSocs(catalog, current.id);
  const groupSocs = validateGroupSocs(input.groupSocs, externalSocs);

  return {
    ...input.previousConfig,
    soc: current.stationName,
    soc_id: current.id,
    soc_code: current.stationCode,
    number_prefix: current.numberPrefix,
    cookies: input.cookies.trim(),
    hubs: hubs.map(({ stationName }) => stationName),
    hub_ids: Object.fromEntries(
      hubs.map(({ stationName, id }) => [stationName, id]),
    ),
    hub_codes: Object.fromEntries(
      hubs.map(({ stationName, stationCode }) => [stationName, stationCode]),
    ),
    socs: externalSocs.map(({ stationName }) => stationName),
    soc_ids: Object.fromEntries(
      externalSocs.map(({ stationName, id }) => [stationName, id]),
    ),
    soc_codes: Object.fromEntries(
      externalSocs.map(({ stationName, stationCode }) => [
        stationName,
        stationCode,
      ]),
    ),
    group_socs: groupSocs,
    raw_group_socs_text: undefined,
    ggsheet_log_url: input.logUrl.trim(),
  };
};
