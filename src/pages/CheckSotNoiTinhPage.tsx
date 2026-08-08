import { useState, useEffect } from "react";
import { getHubs, getSoc, getSocId, getStationId, getCookies } from "../utils/config";
import apiClient from "../utils/apiClient";
import { TOTable, type TransferOrder } from "../components/TOTable";
import { LooseOrderSummary } from "../components/LooseOrderSummary";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import { useLooseOrderCheck } from "../hooks/useLooseOrderCheck";
import { Search, MapPin, PackageCheck } from "lucide-react";

export const CheckSotNoiTinhPage = () => {
  const [hubs, setHubs] = useState<string[]>([]);
  const [soc, setSoc] = useState<string>("");
  const [hub, setHub] = useState("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const looseOrders = useLooseOrderCheck();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHubs(getHubs());
    setSoc(getSoc());
  }, []);

  const checkSotNoiTinh = async () => {
    const currentSoc = getSoc();
    const currentSocId = getSocId();
    const destinationId = getStationId(hub);
    const cookies = getCookies();

    if (!hub) {
      showToast("Vui lòng chọn Hub nội tỉnh để kiểm tra!", "warning");
      return;
    }

    if (!currentSoc) {
      showToast(
        "Chưa cài đặt Mã SOC của bạn! Vui lòng vào trang Cài Đặt để nhập Mã SOC.",
        "error",
      );
      return;
    }

    if (!currentSocId || !destinationId) {
      showToast("SOC nguồn hoặc Hub đích chưa có ID. Vui lòng bổ sung trong Cài đặt!", "error");
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
        const url = `/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=${encodeURIComponent(
          hub,
        )}&status=2&ctime=${sevenDaysAgo},${now}`;

        const response = await apiClient.get(url);
        const list = (response.data?.data?.list || []).filter(
          (item: { current_station_name: string }) =>
            item.current_station_name === currentSoc,
        );
        setOrders(list);
        if (list.length === 0) {
          showToast(
            `Không có TO nào bị sót từ ${currentSoc} tới Hub ${hub}`,
            "info",
          );
        } else {
          showToast(
            `Tìm thấy ${list.length} TO sót tới Hub ${hub}`,
            "success",
          );
        }
      };

      const results = await Promise.allSettled([
        checkPackedOrders(),
        looseOrders.run(currentSocId, [destinationId]),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[Check sót nội tỉnh]", result.reason);
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
            <select
              value={hub}
              onChange={(e) => setHub(e.target.value)}
              className="select select-bordered min-h-11 w-full min-w-0 rounded-xl font-semibold focus:select-primary sm:w-60"
            >
              <option value="" disabled>
                -- Chọn Hub nội tỉnh --
              </option>
              {hubs.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

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
