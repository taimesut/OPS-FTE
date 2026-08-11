export interface PackedOrderMetricInput {
  quantity?: number;
  dg_type?: readonly number[];
  high_value?: number;
}

export interface PackedOrderMetrics {
  totalQuantity: number;
  dgBagCount: number;
  gtcBagCount: number;
}

export const isDgType = (dgTypes: readonly number[] | undefined): boolean =>
  dgTypes?.some((type) => type !== 1) ?? false;

export const summarizePackedOrders = (
  orders: readonly PackedOrderMetricInput[],
): PackedOrderMetrics =>
  orders.reduce<PackedOrderMetrics>(
    (summary, order) => ({
      totalQuantity: summary.totalQuantity + (order.quantity || 0),
      dgBagCount: summary.dgBagCount + (isDgType(order.dg_type) ? 1 : 0),
      gtcBagCount: summary.gtcBagCount + (order.high_value === 1 ? 1 : 0),
    }),
    { totalQuantity: 0, dgBagCount: 0, gtcBagCount: 0 },
  );
