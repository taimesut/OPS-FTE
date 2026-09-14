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
import { useLooseOrderCheck } from "../hooks/useLooseOrderCheck";
import { createDefaultCreateTimeRange } from "../utils/createTimeRange";
import { Search, Globe, PackageCheck } from "lucide-react";

export const CheckSotNgoaiTinhPage = () => {
  const [soc, setSoc] = useState("");
  const [socs, setSocs] = useState<string[]>([]);
  const [currentSoc, setCurrentSoc] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const looseOrders = useLooseOrderCheck();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocs(getSocs() || []);
    setCurrentSoc(getSoc() || "");
  }, []);

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
        setOrders(uniqueList);

        if (uniqueList.length === 0) {
          showToast(
            `Không có TO ngoại tỉnh nào bị sót từ ${sender} tới ${soc}`,
            "info",
          );
        } else {
          showToast(
            `Tìm thấy ${uniqueList.length} TO sót tới SOC ${soc}`,
            "success",
          );
        }
      };

      const results = await Promise.allSettled([
        checkPackedOrders(),
        looseOrders.run(senderId, receiverIds),
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
