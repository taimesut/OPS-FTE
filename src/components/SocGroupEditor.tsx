import { useMemo, useState } from "react";
import {
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { StationCatalogSoc } from "../utils/stationCatalog";
import { StationSelect } from "./StationSelect";

interface SocGroupEditorProps {
  options: readonly StationCatalogSoc[];
  groups: Record<string, string[]>;
  onChange: (groups: Record<string, string[]>) => void;
  disabled?: boolean;
}

const sortMemberNames = (
  names: readonly string[],
  options: readonly StationCatalogSoc[],
): string[] => {
  const selected = new Set(names);
  return options
    .map(({ stationName }) => stationName)
    .filter((stationName) => selected.has(stationName));
};

export const SocGroupEditor = ({
  options,
  groups,
  onChange,
  disabled = false,
}: SocGroupEditorProps) => {
  const [representativeId, setRepresentativeId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberNames, setMemberNames] = useState<string[]>([]);

  const model = useMemo(() => {
    const byId = new Map(options.map((soc) => [soc.id, soc]));
    const idByName = new Map(
      options.map(({ stationName, id }) => [stationName, id]),
    );
    return { byId, idByName };
  }, [options]);

  const representative = model.byId.get(representativeId);
  const availableMembers = useMemo(() => {
    const selected = new Set(memberNames);
    return options.filter(
      ({ id, stationName }) =>
        id !== representativeId && !selected.has(stationName),
    );
  }, [memberNames, options, representativeId]);

  const configuredGroups = useMemo(
    () =>
      options
        .map(({ stationName }) => ({
          representative: stationName,
          members: groups[stationName],
        }))
        .filter(
          (group): group is { representative: string; members: string[] } =>
            Array.isArray(group.members) && group.members.length > 1,
        ),
    [groups, options],
  );

  const resetEditor = () => {
    setRepresentativeId("");
    setMemberId("");
    setMemberNames([]);
  };

  const handleRepresentativeChange = (socId: string) => {
    setRepresentativeId(socId);
    setMemberId("");
    const selected = model.byId.get(socId);
    const savedMembers = selected ? groups[selected.stationName] ?? [] : [];
    setMemberNames(
      sortMemberNames(
        savedMembers.filter((name) => name !== selected?.stationName),
        options,
      ),
    );
  };

  const handleAddMember = () => {
    const member = model.byId.get(memberId);
    if (!member || member.id === representativeId) return;
    setMemberNames((current) =>
      sortMemberNames([...current, member.stationName], options),
    );
    setMemberId("");
  };

  const handleSaveGroup = () => {
    if (!representative) return;
    const nextGroups = { ...groups };
    const members = sortMemberNames(memberNames, options);
    if (members.length) {
      nextGroups[representative.stationName] = [
        representative.stationName,
        ...members,
      ];
    } else {
      delete nextGroups[representative.stationName];
    }
    onChange(nextGroups);
    resetEditor();
  };

  const handleEditGroup = (representativeName: string) => {
    const socId = model.idByName.get(representativeName) ?? "";
    handleRepresentativeChange(socId);
  };

  const handleDeleteGroup = (representativeName: string) => {
    const nextGroups = { ...groups };
    delete nextGroups[representativeName];
    onChange(nextGroups);
    if (representative?.stationName === representativeName) resetEditor();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-base-300 bg-base-100 p-3 sm:p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <label className="text-sm font-bold text-base-content" htmlFor="group-representative-note">
              SOC đại diện
            </label>
            <StationSelect
              value={representativeId}
              options={options}
              onChange={handleRepresentativeChange}
              placeholder="Chọn SOC đại diện"
              disabled={disabled}
              ariaLabel="Chọn SOC đại diện"
            />
            <p id="group-representative-note" className="text-xs leading-relaxed text-base-content/65">
              SOC đại diện luôn được thêm tự động vào đầu nhóm.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-base-content" htmlFor="group-member-note">
              SOC thành viên
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <StationSelect
                value={memberId}
                options={availableMembers}
                onChange={setMemberId}
                placeholder="Chọn thành viên"
                disabled={disabled || !representativeId}
                ariaLabel="Chọn SOC thành viên"
              />
              <button
                type="button"
                onClick={handleAddMember}
                disabled={disabled || !memberId}
                className="btn btn-outline min-h-11 touch-manipulation gap-2 rounded-xl active:opacity-70"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Thêm
              </button>
            </div>
            <p id="group-member-note" className="text-xs leading-relaxed text-base-content/65">
              Có thể thêm một SOC vào nhiều nhóm khác nhau.
            </p>
          </div>
        </div>

        {representative ? (
          <div className="mt-4 space-y-3 border-t border-base-200 pt-4">
            <div className="flex flex-wrap gap-2" aria-label="Thành viên đang chọn">
              <span className="inline-flex min-h-11 items-center rounded-xl bg-primary px-3 text-sm font-bold text-primary-content">
                {representative.stationName}
                <span className="ml-2 text-[11px] font-semibold opacity-80">Đại diện</span>
              </span>
              {memberNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex min-h-11 max-w-full items-center rounded-xl border border-base-300 bg-base-200 pl-3 text-sm font-semibold"
                >
                  <span className="break-words py-2">{name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setMemberNames((current) =>
                        current.filter((member) => member !== name),
                      )
                    }
                    disabled={disabled}
                    aria-label={`Xóa ${name} khỏi nhóm`}
                    className="ml-1 inline-grid min-h-11 min-w-11 touch-manipulation place-items-center rounded-xl text-base-content/60 hover:bg-base-300 hover:text-error active:opacity-70"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>

            <div className="grid gap-2 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={resetEditor}
                disabled={disabled}
                className="btn btn-ghost min-h-11 touch-manipulation gap-2 rounded-xl active:opacity-70"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveGroup}
                disabled={disabled}
                className="btn btn-primary min-h-11 touch-manipulation gap-2 rounded-xl active:opacity-80"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {groups[representative.stationName] ? "Cập nhật nhóm" : "Lưu nhóm"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-base-content">
            <Users className="h-4 w-4 text-info" aria-hidden="true" />
            Nhóm đã cấu hình
          </div>
          <span className="text-xs font-semibold tabular-nums text-base-content/60">
            {configuredGroups.length} nhóm
          </span>
        </div>

        {configuredGroups.length ? (
          <div className="grid gap-2">
            {configuredGroups.map(({ representative: name, members }) => (
              <div
                key={name}
                className="rounded-2xl border border-base-300 bg-base-100 p-3 sm:p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="break-words font-bold text-base-content">{name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((memberName) => (
                        <span
                          key={memberName}
                          className="rounded-lg bg-base-200 px-2.5 py-1 text-xs font-semibold text-base-content/75"
                        >
                          {memberName}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditGroup(name)}
                      disabled={disabled}
                      className="btn btn-ghost min-h-11 touch-manipulation gap-1.5 rounded-xl active:opacity-70"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(name)}
                      disabled={disabled}
                      className="btn btn-ghost min-h-11 touch-manipulation gap-1.5 rounded-xl text-error active:opacity-70"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Xóa
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-base-300 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-base-content/70">
              Chưa có nhóm mở rộng.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-base-content/55">
              SOC chưa tạo nhóm vẫn được tra cứu độc lập như bình thường.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
