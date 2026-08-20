import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  PackageSearch,
  RefreshCw,
  Settings,
} from "lucide-react";
import { InternalHubVolumeTable } from "../components/InternalHubVolumeTable";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import {
  getCookies,
  getHubs,
  getSoc,
  getSocId,
  getStationId,
} from "../utils/config";
import {
  createInternalHubVolumeRows,
  getInternalHubVolumeCooldownRemaining,
  INTERNAL_HUB_VOLUME_COOLDOWN_MS,
  startInternalHubVolumeCooldown,
  summarizeInternalHubVolume,
  validateInternalHubVolumeConfig,
  type HubVolumeDefinition,
  type HubVolumeRow,
} from "../utils/internalHubVolume";
import { fetchAllInternalHubVolumes } from "../utils/internalHubVolumeApi";

const COOLDOWN_TICK_MS = 1_000;
const numberFormatter = new Intl.NumberFormat("vi-VN");
const updatedAtFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Bangkok",
});

const readHubs = (): HubVolumeDefinition[] =>
  getHubs().map((name) => ({ name, id: getStationId(name) }));

const formatUpdatedAt = (value: number | null): string => {
  if (value === null) return "Chưa có lượt kiểm tra nào";
  return `Hoàn tất gần nhất: ${updatedAtFormatter.format(new Date(value))}`;
};

interface SummaryCardProps {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  description: string;
  tone: string;
}

const SummaryCard = ({
  icon: Icon,
  label,
  value,
  description,
  tone,
}: SummaryCardProps) => (
  <article className="app-surface min-w-0 p-3 sm:p-4">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="break-safe text-xs font-bold uppercase tracking-wide text-base-content/55">
          {label}
        </p>
        <p className="mt-1 break-safe text-2xl font-black tabular-nums tracking-tight text-base-content md:text-3xl">
          {value}
        </p>
      </div>
      <span className={`app-icon-badge shrink-0 ${tone}`}>
        <Icon aria-hidden="true" />
      </span>
    </div>
    <p className="mt-2 break-safe text-xs leading-relaxed text-base-content/60">
      {description}
    </p>
  </article>
);

export const InternalHubVolumePage = () => {
  const [soc, setSoc] = useState(() => getSoc());
  const [hubs, setHubs] = useState<HubVolumeDefinition[]>(readHubs);
  const [rows, setRows] = useState<HubVolumeRow[]>(() =>
    createInternalHubVolumeRows(readHubs()),
  );
  const [running, setRunning] = useState(false);
  const [lastCompletedAt, setLastCompletedAt] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(() =>
    getInternalHubVolumeCooldownRemaining(localStorage, Date.now()),
  );
  const activeRequestRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const updateCooldown = () => {
      setCooldownRemaining(
        getInternalHubVolumeCooldownRemaining(localStorage, Date.now()),
      );
    };
    updateCooldown();
    const intervalId = window.setInterval(updateCooldown, COOLDOWN_TICK_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const summary = useMemo(() => summarizeInternalHubVolume(rows), [rows]);

  const handleRefresh = useCallback(async () => {
    const currentCooldown = getInternalHubVolumeCooldownRemaining(
      localStorage,
      Date.now(),
    );
    if (activeRequestRef.current || currentCooldown > 0) {
      setCooldownRemaining(currentCooldown);
      return;
    }

    const currentSoc = getSoc();
    const currentSocId = getSocId();
    const currentCookies = getCookies();
    const currentHubs = readHubs();
    const configError = validateInternalHubVolumeConfig({
      soc: currentSoc,
      socId: currentSocId,
      cookies: currentCookies,
      hubs: currentHubs,
    });
    if (configError) {
      showToast(configError, "error");
      return;
    }

    const startedAt = Date.now();
    activeRequestRef.current = true;
    startInternalHubVolumeCooldown(localStorage, startedAt);
    setCooldownRemaining(INTERNAL_HUB_VOLUME_COOLDOWN_MS);
    setRunning(true);
    setSoc(currentSoc);
    setHubs(currentHubs);
    setRows(
      createInternalHubVolumeRows(currentHubs).map((row) => ({
        ...row,
        status: "loading",
      })),
    );

    try {
      const results = await fetchAllInternalHubVolumes(
        currentSocId,
        currentHubs,
      );
      const completedAt = Date.now();
      const nextRows: HubVolumeRow[] = results.map((result) =>
        result.ok
          ? {
              ...result.hub,
              status: "success",
              total: result.total,
              error: null,
              updatedAt: completedAt,
            }
          : {
              ...result.hub,
              status: "error",
              total: null,
              error: result.error,
              updatedAt: null,
            },
      );
      const errorCount = results.filter((result) => !result.ok).length;

      if (mountedRef.current) {
        setRows(nextRows);
        setLastCompletedAt(completedAt);
        showToast(
          errorCount === 0
            ? `Đã cập nhật volume của ${results.length} Hub.`
            : `Hoàn tất kiểm tra, có ${errorCount} Hub lỗi.`,
          errorCount === 0 ? "success" : "warning",
        );
      }
    } finally {
      activeRequestRef.current = false;
      if (mountedRef.current) setRunning(false);
    }
  }, []);

  const refreshLabel = running
    ? "Đang kiểm tra toàn bộ Hub"
    : cooldownRemaining > 0
      ? `Làm mới sau ${Math.ceil(cooldownRemaining / 1_000)}s`
      : lastCompletedAt === null
        ? "Kiểm tra toàn bộ"
        : "Làm mới";

  const hasSuccessfulData = summary.successfulHubs > 0;

  return (
    <div className="app-page space-y-5 text-base-content md:space-y-6">
      <PageHeader
        icon={ChartNoAxesColumnIncreasing}
        title="Volume nội tỉnh"
        description={`Tổng lượng hàng từ ${soc || "SOC nguồn"} tới toàn bộ Hub nội tỉnh`}
        actions={
          <button
            type="button"
            className="btn btn-primary min-h-11 w-full gap-2 rounded-xl shadow-xs sm:w-auto"
            disabled={running || cooldownRemaining > 0}
            onClick={handleRefresh}
          >
            {running ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {refreshLabel}
          </button>
        }
      />

      <section aria-label="Chỉ số volume nội tỉnh" className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          <SummaryCard
            icon={PackageSearch}
            label="Tổng lượng hàng"
            value={
              hasSuccessfulData
                ? numberFormatter.format(summary.totalVolume)
                : "—"
            }
            description="Cộng data.total của các Hub thành công"
            tone="bg-primary/10 text-primary"
          />
          <SummaryCard
            icon={CheckCircle2}
            label="Hub thành công"
            value={`${summary.successfulHubs}/${summary.totalHubs}`}
            description="Số Hub trả về volume hợp lệ"
            tone="bg-success/10 text-success"
          />
        </div>
        <p className="break-safe text-xs font-medium text-base-content/60">
          {formatUpdatedAt(lastCompletedAt)}
        </p>
      </section>

      <section aria-labelledby="internal-hub-volume-heading" className="space-y-3">
        <SectionHeading
          icon={ChartNoAxesColumnIncreasing}
          id="internal-hub-volume-heading"
          title="Volume theo Hub"
          description="Mỗi Hub hiển thị chỉ số data.total của lần kiểm tra gần nhất"
          tone="primary"
        />

        {hubs.length === 0 ? (
          <div className="app-surface flex min-h-56 flex-col items-center justify-center p-6 text-center sm:p-10">
            <span className="app-icon-badge bg-base-200 text-base-content/45">
              <Settings aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-black">Chưa cấu hình Hub nội tỉnh</h3>
            <p className="mt-1 max-w-md break-safe text-sm leading-relaxed text-base-content/60">
              Vào Cài đặt để thêm danh sách Hub và station ID trước khi kiểm tra volume.
            </p>
          </div>
        ) : (
          <InternalHubVolumeTable rows={rows} />
        )}
      </section>
    </div>
  );
};
