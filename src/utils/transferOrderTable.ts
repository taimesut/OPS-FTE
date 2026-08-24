export const TRANSFER_ORDER_COLUMNS = [
  { key: "to_number", label: "Mã TO" },
  { key: "operator", label: "Người đóng" },
  { key: "classification", label: "Phân loại" },
  { key: "sender", label: "Điểm gửi (Sender)" },
  { key: "route", label: "Điểm đến (Des)" },
  { key: "pack_name", label: "Tên bao" },
  { key: "quantity", label: "Số kiện" },
  { key: "weight", label: "Khối lượng" },
  { key: "status", label: "Trạng thái" },
  { key: "complete_time", label: "Thời gian HT" },
  { key: "action", label: "Thao tác" },
] as const;

export type TransferOrderColumnKey =
  (typeof TRANSFER_ORDER_COLUMNS)[number]["key"];

export const DEFAULT_TRANSFER_ORDER_COLUMNS: TransferOrderColumnKey[] =
  TRANSFER_ORDER_COLUMNS.map(({ key }) => key);

const COLUMN_PREFERENCES_VERSION = 2;
const VALID_COLUMN_KEYS = new Set<string>(DEFAULT_TRANSFER_ORDER_COLUMNS);

const canonicalizeColumns = (values: readonly unknown[]): TransferOrderColumnKey[] => {
  const selected = new Set(
    values.filter(
      (value): value is TransferOrderColumnKey =>
        typeof value === "string" && VALID_COLUMN_KEYS.has(value),
    ),
  );
  return DEFAULT_TRANSFER_ORDER_COLUMNS.filter((key) => selected.has(key));
};

const defaultColumns = (): TransferOrderColumnKey[] => [
  ...DEFAULT_TRANSFER_ORDER_COLUMNS,
];

export const parseTransferOrderColumns = (
  raw: string | null,
): TransferOrderColumnKey[] => {
  if (!raw) return defaultColumns();

  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const hadLegacyClassification = parsed.some(
        (key) => key === "high_value" || key === "dg_type",
      );
      return canonicalizeColumns([
        ...parsed,
        ...(hadLegacyClassification ? ["classification"] : []),
        "sender",
      ]);
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      const preferences = parsed as { version?: unknown; columns?: unknown };
      if (
        preferences.version === COLUMN_PREFERENCES_VERSION &&
        Array.isArray(preferences.columns)
      ) {
        return canonicalizeColumns(preferences.columns);
      }
    }
  } catch {
    return defaultColumns();
  }

  return defaultColumns();
};

export const serializeTransferOrderColumns = (
  columns: readonly TransferOrderColumnKey[],
): string =>
  JSON.stringify({
    version: COLUMN_PREFERENCES_VERSION,
    columns: canonicalizeColumns(columns),
  });

export interface SearchableTransferOrder {
  to_number: string;
  operator?: string;
  sender?: string;
  receiver?: string;
  pack_name?: string;
}

export const matchesTransferOrderSearch = (
  order: SearchableTransferOrder,
  query: string,
): boolean => {
  const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
  if (!normalizedQuery) return true;

  return [
    order.to_number,
    order.operator,
    order.sender,
    order.receiver,
    order.pack_name,
  ].some((value) =>
    value?.toLocaleLowerCase("vi-VN").includes(normalizedQuery),
  );
};
