import { useState, useEffect } from "react";
import {
  getGroupSocsBySOC,
  getSoc,
  getSocs,
  getSocId,
  getStationIds,
} from "../utils/config";
import apiClient from "../utils/apiClient";
import { TOTable, type TransferOrder } from "../components/TOTable";
import { LooseOrderSummary } from "../components/LooseOrderSummary";
import { PageHeader } from "../components/PageHeader";
import { SearchableSelect } from "../components/SearchableSelect";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import { CreateTimeRangeNotice } from "../components/CreateTimeRangeNotice";
import {
  CotCutoffControl,
  type CotProgress,
} from "../components/CotCutoffControl";
import { useLooseOrderCheck } from "../hooks/useLooseOrderCheck";
import {
  createDefaultCreateTimeRange,
  type CreateTimeRange,
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
import { Search, Globe, PackageCheck } from "lucide-react";

const COT_STORAGE_KEY = "check-sot-ngoai-tinh-cot";

export const CheckSotNgoaiTinhPage = () => {
  const [soc, setSoc] = useState("");
  const [socs, setSocs] = useState<string[]>([]);
  const [currentSoc, setCurrentSoc] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const [lastCreateTimeRange, setLastCreateTimeRange] =
    useState<CreateTimeRange | null>(null);
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
    setSocs(getSocs() || []);
    setCurrentSoc(getSoc() || "");
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
      localDateTime: enabled ? formatLocalDateTimeInput() : current.localDateTime,
    }));
  };

  const checkSotNgoaiTinh = async () => {
    const sender = getSoc();
    const senderId = getSocId();

    if (!soc) {
      showToast("Vui lòng chọn SOC ngoại tỉnh để kiểm tra!", "warning");
      return;
    }

    if (!sender) {
      showToast(
        "Chưa cài đặt SOC của bạn! Vui lòng chọn SOC trong trang Cài Đặt.",
        "error",
      );
      return;
    }

    const receivers = getGroupSocsBySOC(soc);
    const receiverIds = getStationIds(receivers);
    if (!senderId || receiverIds.length !== receivers.length) {
      showToast(
        "SOC nguồn hoặc một SOC trong tuyến chưa có ID. Vui lòng kiểm tra lại Cài đặt!",
        "error",
      );
      return;
    }

    const activeCreateTimeRange = createDefaultCreateTimeRange();
    setLastCreateTimeRange(activeCreateTimeRange);
    console.info("[Check sót ngoại tỉnh] Create Time TO đóng bao", {
      from: activeCreateTimeRange.fromLocalDateTime,
      to: activeCreateTimeRange.toLocalDateTime,
      ctime: activeCreateTimeRange.ctime,
    });

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
        const responses = await Promise.all(
          receivers.map((receiver) =>
            apiClient.get(
              `/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=${encodeURIComponent(
                receiver,
              )}&status=2&ctime=${activeCreateTimeRange.ctime}`,
            ),
          ),
        );

        const rawList: TransferOrder[] = [];
        for (const res of responses) {
          if (res.data?.data?.list) {
            rawList.push(...res.data.data.list);
          }
        }

        const uniqueList = Array.from(
          new Map(rawList.map((item) => [item.to_number, item])).values(),
        ).filter(
          (item: { current_station_name: string }) =>
            item.current_station_name === sender,
        );

        let resultOrders = uniqueList;
        if (activeCot) {
          setCotProgress({ processed: 0, total: uniqueList.length });
          try {
            resultOrders = await filterTransferOrdersByCot(
              uniqueList,
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
            `Giữ lại ${resultOrders.length}/${uniqueList.length} TO có trạng thái 882 cuối cùng trước COT`,
            resultOrders.length > 0 ? "success" : "info",
          );
        } else if (resultOrders.length === 0) {
          showToast(
            `Không có TO ngoại tỉnh nào bị sót từ ${sender} tới ${soc}`,
            "info",
          );
        } else {
          showToast(
            `Tìm thấy ${resultOrders.length} TO sót tới SOC ${soc}`,
            "success",
          );
        }
      };

      const results = await Promise.allSettled([
        checkPackedOrders(),
        looseOrders.run(senderId, receiverIds, activeCot?.currentStationReceivedTime),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[Check sót ngoại tỉnh]", result.reason);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page space-y-5 text-base-content md:space-y-6">
      <PageHeader
        icon={Globe}
        tone="secondary"
        title="Kiểm Tra Sót Ngoại Tỉnh"
        description={`Tra cứu danh sách Transfer Order (TO) đã đóng từ ${currentSoc || "SOC"} đi các SOC ngoại tỉnh khác`}
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto">
            <SearchableSelect
              value={soc}
              options={socs}
              onChange={setSoc}
              disabled={loading}
              placeholder="-- Chọn SOC đích --"
              searchPlaceholder="Tìm SOC..."
              emptyText="Không tìm thấy SOC"
              ariaLabel="Chọn SOC đích"
              className="w-full min-w-0 sm:w-60"
            />

            <button
              onClick={checkSotNgoaiTinh}
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

      <CreateTimeRangeNotice range={lastCreateTimeRange} />

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
        currentName={currentSoc}
        currentId={getSocId()}
        destinationName={soc ? getGroupSocsBySOC(soc).join(" + ") : ""}
        destinationIds={soc ? getStationIds(getGroupSocsBySOC(soc)) : []}
      />

      <section aria-labelledby="packed-orders-heading" className="space-y-3">
        <SectionHeading
          icon={PackageCheck}
          id="packed-orders-heading"
          title="Hàng đã đóng bao"
          description={`Transfer Order (TO) đang còn tại ${currentSoc || "SOC nguồn"}`}
          tone="success"
        />

        <TOTable
          orders={orders}
          storageKey="tuy-chon-check-sot-ngoai-tinh"
          emptyTitle="Chưa có dữ liệu sót ngoại tỉnh"
          emptyDescription="Vui lòng chọn SOC ngoại tỉnh và nhấn nút 'Tìm kiếm' để kiểm tra danh sách TO."
        />
      </section>
    </div>
  );
};
