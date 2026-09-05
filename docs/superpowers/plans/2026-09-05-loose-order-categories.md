# Loose Order Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay luồng kiểm tra hàng xá nội tỉnh và ngoại tỉnh bằng bốn truy vấn phân loại, lấy `data.total` và hiển thị năm số liệu gồm Tổng xá.

**Architecture:** `looseOrders.ts` giữ hợp đồng payload, parser và phép tổng hợp thuần; `looseOrdersApi.ts` chịu trách nhiệm gửi song song bốn request qua client hiện có; `LooseOrderSummary.tsx` chỉ trình bày mô hình kết quả mới. Hai trang kiểm tra tiếp tục dùng hook hiện tại nên không cần nhân đôi logic.

**Tech Stack:** TypeScript 6, React 19, Axios, Node test runner, Vite userscript build.

## Global Constraints

- Endpoint giữ nguyên `/api/fleet_order/order/tracking_list/search`.
- Mỗi request dùng `count: 24`, `order_status: "8"`, `page_no: 1`.
- Xá thường dùng `high_value: 0`, `order_dg_type: 1`.
- Xá DG dùng `high_value: 0`, `order_dg_type: 4`.
- Xá GTC dùng `high_value: 1`, `order_dg_type: 1`.
- Xá DG + GTC dùng `high_value: 1`, `order_dg_type: 4`.
- Chỉ dùng `data.total`; không phân loại từ `data.list`.
- Tổng xá bằng tổng của cả bốn nhóm.
- Một request lỗi làm toàn bộ lần kiểm tra thất bại.
- Không thay đổi luồng hàng đã đóng bao hoặc mở rộng bảng tổng quan Hub.

---

### Task 1: Hợp đồng payload và parser tổng

**Files:**
- Modify: `src/utils/looseOrders.ts`
- Test: `tests/looseOrders.test.ts`

**Interfaces:**
- Produces: `LooseOrderCategory = "normal" | "dg" | "gtc" | "dgAndGtc"`.
- Produces: `LOOSE_ORDER_CATEGORIES`, danh sách bốn nhóm theo thứ tự cố định.
- Produces: `createLooseOrderPayload(currentStationId, nextStationIds, category, currentStationReceivedTime?)`.
- Produces: `readLooseOrderTotal(payload): number`.
- Produces: `createLooseOrderSummary(totals): LooseOrderSummary`.

- [ ] **Step 1: Viết test thất bại cho bốn payload**

Thay test payload hiện tại bằng vòng lặp kiểm tra chính xác bốn cặp bộ lọc, `count: 24`, tuyến nguồn/đích và trường thời gian tùy chọn.

```ts
const filters = {
  normal: { high_value: 0, order_dg_type: 1 },
  dg: { high_value: 0, order_dg_type: 4 },
  gtc: { high_value: 1, order_dg_type: 1 },
  dgAndGtc: { high_value: 1, order_dg_type: 4 },
} as const;

for (const [category, filter] of Object.entries(filters)) {
  assert.deepEqual(createLooseOrderPayload("5001", ["6001", "6002", "6001"], category), {
    count: 24,
    current_station_ids: "5001",
    next_station_ids: "6001,6002",
    order_status: "8",
    page_no: 1,
    ...filter,
  });
}
```

- [ ] **Step 2: Viết test thất bại cho parser và phép tổng hợp**

```ts
assert.equal(readLooseOrderTotal({ retcode: 0, data: { total: 7 } }), 7);
assert.deepEqual(createLooseOrderSummary({ normal: 7, dg: 3, gtc: 2, dgAndGtc: 1 }), {
  total: 13,
  normalCount: 7,
  dgCount: 3,
  highValueCount: 2,
  dgAndHighValueCount: 1,
});
assert.throws(() => readLooseOrderTotal({ retcode: 0, data: { total: "7" } }), /không hợp lệ/i);
assert.throws(() => readLooseOrderTotal({ retcode: 0, data: { total: -1 } }), /không hợp lệ/i);
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

Run: `node --experimental-strip-types --test tests/looseOrders.test.ts`

Expected: FAIL vì interface mới và các hàm mới chưa tồn tại.

- [ ] **Step 4: Cài đặt hợp đồng thuần tối thiểu**

Trong `looseOrders.ts`, ánh xạ category sang filter cố định; đổi `count` thành 24; validate `data.total` là số hữu hạn không âm; tạo summary với tổng cộng bốn nhóm. Xóa logic đếm `data.list` cũ.

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `node --experimental-strip-types --test tests/looseOrders.test.ts`

Expected: toàn bộ test `looseOrders` PASS.

- [ ] **Step 6: Commit domain contract**

```bash
git add src/utils/looseOrders.ts tests/looseOrders.test.ts
git commit -m "feat: define loose order category totals"
```

### Task 2: Gửi song song bốn request

**Files:**
- Modify: `src/utils/looseOrdersApi.ts`
- Test: `tests/looseOrders.test.ts`

**Interfaces:**
- Consumes: `LOOSE_ORDER_CATEGORIES`, `createLooseOrderPayload`, `readLooseOrderTotal`, `createLooseOrderSummary` từ Task 1.
- Produces: `fetchLooseOrderSummaryWithClient(client, currentStationId, nextStationIds, currentStationReceivedTime?): Promise<LooseOrderSummary>` để test orchestration mà không gọi mạng.
- Preserves: `fetchLooseOrderSummary(...)` là wrapper dùng `apiClient` thật.

- [ ] **Step 1: Viết test thất bại cho orchestration**

Dùng fake client ghi nhận payload và trả totals theo cặp filter. Gọi `fetchLooseOrderSummaryWithClient`, sau đó xác nhận có đúng bốn call, mọi call dùng `{ suppressErrorToast: true }`, và summary có `total: 13` từ `7 + 3 + 2 + 1`.

```ts
const calls: unknown[] = [];
const client = {
  async post(path: string, payload: Record<string, unknown>, config: unknown) {
    calls.push({ path, payload, config });
    const key = `${payload.high_value}:${payload.order_dg_type}`;
    return { data: { retcode: 0, data: { total: ({ "0:1": 7, "0:4": 3, "1:1": 2, "1:4": 1 } as Record<string, number>)[key] } } };
  },
};
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `node --experimental-strip-types --test tests/looseOrders.test.ts`

Expected: FAIL vì `fetchLooseOrderSummaryWithClient` chưa tồn tại.

- [ ] **Step 3: Cài đặt request song song**

Dùng `Promise.all(LOOSE_ORDER_CATEGORIES.map(...))`. Với mỗi category, tạo payload riêng, gọi client, parse `response.data`, rồi chuyển bốn total sang `createLooseOrderSummary`. Không bắt lỗi cục bộ để một lỗi bất kỳ reject toàn bộ thao tác.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `node --experimental-strip-types --test tests/looseOrders.test.ts`

Expected: toàn bộ test PASS và ghi nhận đủ bốn request.

- [ ] **Step 5: Commit API orchestration**

```bash
git add src/utils/looseOrdersApi.ts tests/looseOrders.test.ts
git commit -m "feat: fetch loose order categories in parallel"
```

### Task 3: Hiển thị năm chỉ số

**Files:**
- Modify: `src/components/LooseOrderSummary.tsx`

**Interfaces:**
- Consumes: `LooseOrderCheckState` có success summary gồm `total`, `normalCount`, `dgCount`, `highValueCount`, `dgAndHighValueCount`.
- Produces: lưới responsive năm thẻ và năm skeleton khi loading.

- [ ] **Step 1: Cập nhật cấu hình thẻ chỉ số**

Thêm tone trung tính cho “Xá thường”, giữ icon có sẵn cho Tổng/DG/GTC và dùng icon ghép phù hợp cho “DG + GTC”. Nhãn hiển thị chính xác: `Tổng xá`, `Xá thường`, `Xá DG`, `Xá GTC`, `DG + GTC`.

- [ ] **Step 2: Cập nhật lưới responsive và loading**

Dùng bố cục hai cột trên màn hình nhỏ và năm cột từ breakpoint phù hợp; thẻ Tổng xá có thể chiếm toàn hàng trên màn hình nhỏ. Render năm skeleton với cùng bố cục để tránh layout shift.

- [ ] **Step 3: Chạy kiểm tra TypeScript và lint**

Run: `node node_modules/typescript/lib/tsc.js -b`

Expected: PASS, không lỗi type hoặc unused import.

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 4: Commit UI**

```bash
git add src/components/LooseOrderSummary.tsx
git commit -m "feat: show five loose order metrics"
```

### Task 4: Hồi quy và đóng gói userscript

**Files:**
- Verify: `src/pages/CheckSotNoiTinhPage.tsx`
- Verify: `src/pages/CheckSotNgoaiTinhPage.tsx`
- Verify: `src/utils/internalHubOverview.ts`
- Generate: `userscript-dist/ops-fte.user.js` và tài nguyên public do Vite sao chép

**Interfaces:**
- Consumes: toàn bộ thay đổi từ Task 1-3.
- Produces: userscript build hoàn chỉnh dùng logic mới.

- [ ] **Step 1: Chạy toàn bộ test**

Run: `npm test`

Expected: tất cả test PASS; nếu fixture `LooseOrderSummary` trong test tổng quan Hub thiếu trường mới, bổ sung đủ năm trường mà không đổi kỳ vọng cột hiện tại.

- [ ] **Step 2: Build ứng dụng chính**

Run: `npm run build`

Expected: TypeScript và Vite build PASS.

- [ ] **Step 3: Build userscript**

Run: `npm run build:userscript`

Expected: build PASS và `userscript-dist/ops-fte.user.js` chứa các key `order_dg_type`, `normalCount`, `dgAndHighValueCount`.

- [ ] **Step 4: Kiểm tra diff cuối**

Run: `git diff --check`

Expected: không có whitespace error. Xác nhận diff không ghi đè thay đổi có sẵn trong `src/pages/HomePage.tsx` và `package-lock.json`.

- [ ] **Step 5: Commit bundle liên quan**

```bash
git add userscript-dist
git commit -m "build: refresh loose order userscript"
```

Chỉ stage các file nguồn, test, tài liệu và bundle thuộc thay đổi này; không tự động gộp thay đổi chưa rõ nguồn gốc trong `HomePage.tsx` hoặc `package-lock.json`.
