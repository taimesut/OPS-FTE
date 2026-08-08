export interface StationEntry {
  name: string;
  id: string;
}

export const formatStationEntry = (name: string, id?: string): string =>
  id?.trim() ? `${name.trim()} | ${id.trim()}` : name.trim();

export const parseStationLine = (line: string, label = "Trạm"): StationEntry => {
  const parts = line.split("|");
  if (parts.length !== 2) {
    throw new Error(`${label} phải có định dạng "Tên | ID": ${line.trim()}`);
  }
  const name = parts[0].trim();
  const id = parts[1].trim();
  if (!name) throw new Error(`${label} đang thiếu tên.`);
  if (!id) throw new Error(`${label} "${name}" đang thiếu ID.`);
  return { name, id };
};

export const parseStationLines = (text: string, label: string): StationEntry[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseStationLine(line, label));

export const validateUniqueStations = (entries: StationEntry[]): void => {
  const names = new Set<string>();
  const ids = new Map<string, string>();
  for (const entry of entries) {
    const normalizedName = entry.name.toLocaleLowerCase("vi-VN");
    if (names.has(normalizedName)) {
      throw new Error(`Tên trạm bị trùng: ${entry.name}`);
    }
    names.add(normalizedName);
    const existingName = ids.get(entry.id);
    if (existingName) {
      throw new Error(`ID ${entry.id} đang được dùng cho cả "${existingName}" và "${entry.name}".`);
    }
    ids.set(entry.id, entry.name);
  }
};

export const createStationIdMap = (entries: StationEntry[]): Record<string, string> =>
  Object.fromEntries(entries.map(({ name, id }) => [name, id]));
