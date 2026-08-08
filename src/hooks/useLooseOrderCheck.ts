import { useCallback, useState } from "react";
import type { LooseOrderSummary } from "../utils/looseOrders";
import { fetchLooseOrderSummary } from "../utils/looseOrdersApi";

export type LooseOrderCheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; summary: LooseOrderSummary }
  | { status: "error"; message: string };

const FALLBACK_ERROR =
  "Không tải được hàng xá lẻ. Vui lòng kiểm tra kết nối và thử lại.";

export const useLooseOrderCheck = () => {
  const [state, setState] = useState<LooseOrderCheckState>({ status: "idle" });

  const run = useCallback(async (currentStationId: string, nextStationIds: string[]) => {
    setState({ status: "loading" });

    try {
      const summary = await fetchLooseOrderSummary(currentStationId, nextStationIds);
      setState({ status: "success", summary });
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
      setState({ status: "error", message });
    }
  }, []);

  return { state, run };
};
