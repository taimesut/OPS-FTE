# Thiết kế quét QR cho trang Lấy mã TO

## Mục tiêu

Bổ sung khả năng quét QR mã đơn trên trang `Lấy mã TO` để điền nhanh mã vận đơn vào ô nhập. Việc quét chỉ cập nhật input; người dùng vẫn phải chủ động nhấn `Lấy mã TO` để gọi API.

## Phạm vi

- Chỉ thay đổi trang `src/pages/LayMaTOPage.tsx`.
- Tái sử dụng `EmbeddedQRScanner` và kiểu `ScanMode` hiện có.
- Không sửa component scanner chung, endpoint tra cứu, parser response, QR kết quả hoặc các trang khác.
- Không tự động gọi API sau khi scanner trả kết quả.

## Luồng thao tác

1. Trang hiển thị thêm nút `Quét QR` bên cạnh nút `Lấy mã TO`.
2. Người dùng nhấn `Quét QR`.
3. `EmbeddedQRScanner` mở toàn màn hình với mode `item`.
4. Scanner nhận được một chuỗi không rỗng và đóng theo hành vi hiện có.
5. Trang `trim()` chuỗi nhận được rồi điền vào input mã đơn.
6. Trang hiển thị toast `Đã nhận mã đơn: <mã>`.
7. Trang không gọi `fetchTransferOrderNumber` ở bước này.
8. Người dùng kiểm tra giá trị rồi nhấn `Lấy mã TO` để thực hiện luồng tra cứu hiện có.

## Trạng thái giao diện

- Trang thêm state `scannerMode: ScanMode | null`.
- `scannerMode === "item"` mở scanner; `null` đóng scanner.
- Nút `Quét QR` bị vô hiệu hóa khi request tra cứu TO đang loading.
- Scanner bị đóng trước khi trang cập nhật input và hiển thị toast.
- Đóng scanner thủ công không thay đổi input hiện tại.
- Quét mã mới không xóa kết quả TO thành công gần nhất và không tự mở modal QR kết quả.

## Bố cục

- Hai nút hành động nằm trong một grid một cột trên màn hình hẹp và hai cột trên màn hình đủ rộng.
- `Lấy mã TO` tiếp tục là hành động chính với style primary.
- `Quét QR` là hành động phụ với style outline và icon scan từ Lucide.
- Cả hai nút có chiều cao tối thiểu 48px và chiếm toàn bộ chiều rộng trên điện thoại.

## Tích hợp scanner

Trang render:

```tsx
<EmbeddedQRScanner
  open={scannerMode !== null}
  mode={scannerMode}
  onScan={handleScan}
  onClose={() => setScannerMode(null)}
/>
```

Handler nhận kết quả:

```ts
const handleScan = (value: string) => {
  const normalizedValue = value.trim();
  setScannerMode(null);
  if (!normalizedValue) return;
  setShipmentId(normalizedValue);
  showToast(`Đã nhận mã đơn: ${normalizedValue}`, "success");
};
```

Handler này không gọi `handleLookup`, `fetchTransferOrderNumber` hoặc submit form.

## Xử lý lỗi

- Chuỗi scan rỗng bị bỏ qua và không ghi đè input.
- Lỗi camera, timeout iframe và popup bị chặn tiếp tục được `EmbeddedQRScanner` xử lý như hiện tại.
- Người dùng có thể đóng scanner để quay lại trang mà không mất dữ liệu.
- Nếu đang loading request TO, nút mở scanner bị disable.

## Tiêu chí nghiệm thu

1. Trang có nút `Quét QR` rõ ràng và thao tác được trên điện thoại.
2. Nhấn nút mở scanner toàn màn hình với mode `item`.
3. Scan `SPXVN062072327098` điền đúng chuỗi đó vào input.
4. Scan không tự gọi API và không tự mở modal QR kết quả.
5. Người dùng phải nhấn `Lấy mã TO` để gửi request.
6. Đóng scanner không làm mất input hoặc kết quả gần nhất.
7. Nút scan bị khóa khi tra cứu đang loading.
8. Test, lint và production build hiện có vẫn đạt.

## QA

- Kiểm tra source handler không gọi API.
- QA ở viewport 390 × 844: bố cục nút, mở/đóng scanner và input sau scan.
- Kiểm tra drawer, route, modal QR kết quả và kiểm soát email Apps Script vẫn hoạt động như trước.
- Build lại và đóng gói `gas/index.html` sau khi tích hợp, đồng thời giữ riêng các thay đổi ngoài phạm vi của người dùng.
