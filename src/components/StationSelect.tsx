import { useMemo } from "react";
import type { StationCatalogSoc } from "../utils/stationCatalog";
import { SearchableSelect } from "./SearchableSelect";

interface StationSelectProps {
  value: string;
  options: readonly StationCatalogSoc[];
  onChange: (socId: string) => void;
  placeholder: string;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}

const stationLabel = (soc: StationCatalogSoc): string =>
  `${soc.stationName} (${soc.stationCode})`;

export const StationSelect = ({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  ariaLabel,
  className,
}: StationSelectProps) => {
  const model = useMemo(() => {
    const labels: string[] = [];
    const labelById = new Map<string, string>();
    const idByLabel = new Map<string, string>();

    for (const option of options) {
      const label = stationLabel(option);
      labels.push(label);
      labelById.set(option.id, label);
      idByLabel.set(label, option.id);
    }

    return { labels, labelById, idByLabel };
  }, [options]);

  return (
    <SearchableSelect
      value={model.labelById.get(value) ?? ""}
      options={model.labels}
      onChange={(label) => onChange(model.idByLabel.get(label) ?? "")}
      placeholder={placeholder}
      searchPlaceholder="Tìm theo tên hoặc mã SOC..."
      emptyText="Không tìm thấy SOC phù hợp"
      disabled={disabled}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
};
