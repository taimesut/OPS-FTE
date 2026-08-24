export interface PackedOrderMetricInput {
  quantity?: number;
  dg_type?: readonly number[];
  high_value?: number;
}

export interface PackedOrderMetrics {
  totalQuantity: number;
  dgBagCount: number;
  gtcBagCount: number;
  dgAndGtcBagCount: number;
}

export const isDgType = (dgTypes: readonly number[] | undefined): boolean =>
  dgTypes?.some((type) => type !== 1) ?? false;

export type PackedOrderClassification =
  | "normal"
  | "dg"
  | "gtc"
  | "dg_and_gtc";

export const classifyPackedOrder = (
  order: Pick<PackedOrderMetricInput, "dg_type" | "high_value">,
): PackedOrderClassification => {
  const hasDg = isDgType(order.dg_type);
  const hasGtc = order.high_value === 1;

  if (hasDg && hasGtc) return "dg_and_gtc";
  if (hasDg) return "dg";
  if (hasGtc) return "gtc";
  return "normal";
};

export const summarizePackedOrders = (
  orders: readonly PackedOrderMetricInput[],
): PackedOrderMetrics => {
  const summary: PackedOrderMetrics = {
    totalQuantity: 0,
    dgBagCount: 0,
    gtcBagCount: 0,
    dgAndGtcBagCount: 0,
  };

  for (const order of orders) {
    summary.totalQuantity += order.quantity || 0;
    const classification = classifyPackedOrder(order);
    if (classification === "dg") summary.dgBagCount += 1;
    if (classification === "gtc") summary.gtcBagCount += 1;
    if (classification === "dg_and_gtc") summary.dgAndGtcBagCount += 1;
  }

  return summary;
};
