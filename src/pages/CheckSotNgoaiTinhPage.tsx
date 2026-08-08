import { useState, useEffect } from "react";
import {
  getGroupSocsBySOC,
  getSoc,
  getSocs,
  getCookies,
  getSocId,
  getStationIds,
} from "../utils/config";
import apiClient from "../utils/apiClient";
import { TOTable, type TransferOrder } from "../components/TOTable";
import { LooseOrderSummary } from "../components/LooseOrderSummary";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import { useLooseOrderCheck } from "../hooks/useLooseOrderCheck";
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
    const cookies = getCookies();

    if (!soc) {
      showToast("Vui lòng chọn SOC ngoại tỉnh để kiểm tra!", "warning");
      return;
    }

    if (!sender) {
      showToast(
        "Chưa cài đặt Mã SOC của bạn! Vui lòng vào trang Cài Đặt để nhập Mã SOC.",
        "error",
      );
      return;
    }

    const receivers = getGroupSocsBySOC(soc);
    const receiverIds = getStationIds(receivers);
    if (!senderId || receiverIds.length !== receivers.length) {
      showToast("SOC nguồn hoặc một SOC trong tuyến chưa có ID. Vui lòng bổ sung trong Cài đặt!", "error");
      return;
    }

    if (!cookies) {
      showToast(
        "Chưa có Cookie SPX! Vui lòng vào trang Cài Đặt để dán Cookie.",
        "error",
      );
      return;
    }

    setLoading(true);

    try {
      const checkPackedOrders = async () => {
        const now = Math.floor(Date.now() / 1000);
        const sevenDaysAgo = now - 7 * 24 * 60 * 60;

        const responses = await Promise.all(
          receivers.map((receiver) =>
            apiClient.get(
              `/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=${encodeURIComponent(
                receiver,
              )}&status=2&ctime=${sevenDaysAgo},${now}`,
            ),
          ),
        );

        const rawList: TransferOrder[] = [];
        for (const res of responses) {
          if (res.data?.data?.list) {
            rawList.push(...res.data.data.list);
          }
        }

        // Loại bỏ TO trùng lặp
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
            <select
              value={soc}
              onChange={(e) => setSoc(e.target.value)}
              className="select select-bordered min-h-11 w-full min-w-0 rounded-xl font-semibold focus:select-primary sm:w-60"
            >
              <option value="" disabled>
                -- Chọn SOC đích --
              </option>
              {socs.map((s, index) => (
                <option key={index} value={s}>
                  {s}
                </option>
              ))}
            </select>

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
