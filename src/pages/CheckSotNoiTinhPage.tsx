import { useState, useEffect } from "react";
import { getHubs, getSoc, getSocId, getStationId } from "../utils/config";
import apiClient from "../utils/apiClient";
import { TOTable, type TransferOrder } from "../components/TOTable";
import { LooseOrderSummary } from "../components/LooseOrderSummary";
import { PageHeader } from "../components/PageHeader";
import { SearchableSelect } from "../components/SearchableSelect";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import { CreateTimeRangeControl } from "../components/CreateTimeRangeControl";
import {
  CotCutoffControl,
  type CotProgress,
} from "../components/CotCutoffControl";
import { useLooseOrderCheck } from "../hooks/useLooseOrderCheck";
import {
  createCreateTimeRange,
  createDefaultCreateTimeRangeInput,
  type CreateTimeRangeInput,
} from "../utils/createTimeRange";
import {
  createCotWindow,
  formatLocalDateTimeInput,
  parseCotCutoffPreferences,
  serializeCotCutoffPreferences,
  type CotCutoffPreferences,
  type CotWindow,
} from "../utils/cotCutoff";
import { filterTransferOrdersByCot } from "../utils/transferOrderCot";
import { fetchLatestTransferOrderCotTimestamp } from "../utils/transferOrderCotApi";
import { Search, MapPin, PackageCheck } from "lucide-react";

const COT_STORAGE_KEY = "check-sot-noi-tinh-cot";

export const CheckSotNoiTinhPage = () => {
  const [hubs, setHubs] = useState<string[]>([]);
  const [soc, setSoc] = useState<string>("");
  const [hub, setHub] = useState("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const [createTimeRangeInput, setCreateTimeRangeInput] =
    useState<CreateTimeRangeInput>(() => createDefaultCreateTimeRangeInput());
  const [cotPreferences, setCotPreferences] =
    useState<CotCutoffPreferences>(() => {
      try {
        return parseCotCutoffPreferences(
          localStorage.getItem(COT_STORAGE_KEY),
        );
      } catch {
        return { enabled: false, localDateTime: "" };
      }
    });
  const [cotProgress, setCotProgress] = useState<CotProgress | null>(null);
  const looseOrders = useLooseOrderCheck();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHubs(getHubs());
    setSoc(getSoc());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        COT_STORAGE_KEY,
        serializeCotCutoffPreferences(cotPreferences),
      );
    } catch {
      // Optional browser storage must not prevent searches.
    }
  }, [cotPreferences]);

  const handleCotEnabledChange = (enabled: boolean) => {
    setCotPreferences((current) => ({
      enabled,
      // Mỗi lần bật COT, mặc định lấy đúng thời gian hiện tại; người dùng có thể sửa lại.
      localDateTime: enabled ? formatLocalDateTimeInput() : current.localDateTime,
    }));
  };

  const resetCreateTimeRange = () => {
    setCreateTimeRangeInput(createDefaultCreateTimeRangeInput());
  };

  const checkSotNoiTinh = async () => {
    const currentSoc = getSoc();
    const currentSocId = getSocId();
    const destinationId = getStationId(hub);

    if (!hub) {
      showToast("Vui lòng chọn Hub nội tỉnh để kiểm tra!", "warning");
      return;
    }

    if (!currentSoc) {
      showToast(
        "Chưa cài đặt SOC của bạn! Vui lòng chọn SOC trong trang Cài Đặt.",
        "error",
      );
      return;
    }

    if (!currentSocId || !destinationId) {
      showToast(
        "SOC nguồn hoặc Hub đích chưa có ID. Vui lòng kiểm tra lại Cài đặt!",
        "error",
      );
      return;
    }

    let activeCreateTimeRange;
    try {
      activeCreateTimeRange = createCreateTimeRange(
        createTimeRangeInput.fromLocalDateTime,
        createTimeRangeInput.toLocalDateTime,
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Create time không hợp lệ.",
        "warning",
      );
      return;
    }

    let cotWindow: CotWindow | undefined;
    if (cotPreferences.enabled) {
      try {
        cotWindow = createCotWindow(cotPreferences.localDateTime);
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : "Thời gian COT không hợp lệ.",
          "warning",
        );
        return;
      }
    }

    const activeCot = cotWindow;

    setLoading(true);

    try {
      const checkPackedOrders = async () => {
        const url = `/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=${encodeURIComponent(
          hub,
        )}&status=2&ctime=${activeCreateTimeRange.ctime}`;

        const response = await apiClient.get(url);
        const stationOrders = (response.data?.data?.list || []).filter(
          (item: { current_station_name: string }) =>
            item.current_station_name === currentSoc,
        ) as TransferOrder[];

        let resultOrders = stationOrders;
        if (activeCot) {
          setCotProgress({ processed: 0, total: stationOrders.length });
          try {
            resultOrders = await filterTransferOrdersByCot(
              stationOrders,
              activeCot.cotTimestamp,
              fetchLatestTransferOrderCotTimestamp,
              (processed, total) => setCotProgress({ processed, total }),
            );
          } finally {
            setCotProgress(null);
          }
        }

        setOrders(resultOrders);
        if (activeCot) {
          showToast(
            `Giữ lại ${resultOrders.length}/${stationOrders.length} TO có trạng thái 882 cuối cùng trước COT`,
            resultOrders.length > 0 ? "success" : "info",
          );
        } else if (resultOrders.length === 0) {
          showToast(
            `Không có TO nào bị sót từ ${currentSoc} tới Hub ${hub}`,
            "info",
          );
        } else {
          showToast(
            `Tìm thấy ${resultOrders.length} TO sót tới Hub ${hub}`,
            "success",
          );
        }
      };

      const [packedResult] = await Promise.allSettled([
        checkPackedOrders(),
        looseOrders.run(
          currentSocId,
          [destinationId],
          activeCot?.currentStationReceivedTime,
        ),
      ]);

      if (packedResult.status === "rejected") {
        console.error("[Check sót nội tỉnh]", packedResult.reason);
        const message =
          packedResult.reason instanceof Error
            ? packedResult.reason.message
            : "";
        if (message.includes("Không thể kiểm tra COT cho")) {
          showToast(message, "error");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page space-y-5 text-base-content md:space-y-6">
      <PageHeader
        icon={MapPin}
        title="Kiểm Tra Sót Nội Tỉnh"
        description={`Tra cứu danh sách Transfer Order (TO) xuất kho từ ${soc || "SOC"} đi các Hub nội tỉnh`}
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto">
            <SearchableSelect
              value={hub}
              options={hubs}
              onChange={setHub}
              disabled={loading}
              placeholder="-- Chọn Hub nội tỉnh --"
              searchPlaceholder="Tìm Hub..."
              emptyText="Không tìm thấy Hub"
              ariaLabel="Chọn Hub nội tỉnh"
              className="w-full min-w-0 sm:w-60"
            />

            <button
              onClick={checkSotNoiTinh}
              disabled={loading}
              className="btn btn-primary min-h-11 w-full gap-2 rounded-xl shadow-xs sm:w-auto"
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Tìm kiếm
                </>
              )}
            </button>
          </div>
        }
      />

      <CreateTimeRangeControl
        fromLocalDateTime={createTimeRangeInput.fromLocalDateTime}
        toLocalDateTime={createTimeRangeInput.toLocalDateTime}
        disabled={loading}
        onFromDateTimeChange={(fromLocalDateTime) =>
          setCreateTimeRangeInput((current) => ({
            ...current,
            fromLocalDateTime,
          }))
        }
        onToDateTimeChange={(toLocalDateTime) =>
          setCreateTimeRangeInput((current) => ({
            ...current,
            toLocalDateTime,
          }))
        }
        onReset={resetCreateTimeRange}
      />

      <CotCutoffControl
        enabled={cotPreferences.enabled}
        localDateTime={cotPreferences.localDateTime}
        disabled={loading}
        progress={cotProgress}
        onEnabledChange={handleCotEnabledChange}
        onDateTimeChange={(localDateTime) =>
          setCotPreferences((current) => ({ ...current, localDateTime }))
        }
      />

      <LooseOrderSummary
        state={looseOrders.state}
        currentName={soc}
        currentId={getSocId()}
        destinationName={hub}
        destinationIds={hub ? [getStationId(hub)].filter(Boolean) : []}
      />

      <section aria-labelledby="packed-orders-heading" className="space-y-3">
        <SectionHeading
          icon={PackageCheck}
          id="packed-orders-heading"
          title="Hàng đã đóng bao"
          description={`Transfer Order (TO) đang còn tại ${soc || "SOC nguồn"}`}
          tone="success"
        />

        <TOTable
          orders={orders}
          storageKey="tuy-chon-check-sot-noi-tinh"
          emptyTitle="Chưa có dữ liệu sót nội tỉnh"
          emptyDescription="Vui lòng chọn Hub nội tỉnh và nhấn nút 'Tìm kiếm' để kiểm tra danh sách TO."
        />
      </section>
    </div>
  );
};
