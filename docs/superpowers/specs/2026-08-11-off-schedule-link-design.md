# Thiết kế liên kết Đăng ký lịch off

## Mục tiêu

Thêm mục **Đăng ký lịch off** vào menu điều hướng của OPS FTE. Khi bấm, app mở trang đăng ký lịch off trong một tab mới và giữ nguyên tab OPS FTE hiện tại.

## Cấu hình

- URL được cấu hình bằng biến Vite `VITE_OFF_SCHEDULE_URL` trong file `.env`.
- Giá trị chính xác:

```text
https://script.google.com/macros/s/AKfycbzHq8j2p_jLW-2SUF4VwWAxGPjegq9QydggnzkWPw6A_2lb02Wqr8RTZlDGd5RGTqaI7g/exec
```

- Đây là URL web app công khai, không phải secret, nên `.env` được commit để các môi trường build tạo cùng một artifact.
- Khai báo kiểu cho `import.meta.env.VITE_OFF_SCHEDULE_URL` để TypeScript kiểm tra tên biến.
- Một helper cấu hình trim giá trị và chỉ chấp nhận URL HTTPS hợp lệ. Helper trả chuỗi rỗng nếu cấu hình thiếu, sai protocol hoặc không phân tích được.

## Giao diện và hành vi

- Thêm mục **Đăng ký lịch off** với icon lịch vào drawer menu, sau mục **Bàn giao PDA**.
- Đây là liên kết ngoài, không thêm React Router route nội bộ.
- Liên kết dùng `target="_blank"` và `rel="noreferrer"`.
- Bấm liên kết đóng drawer trên điện thoại rồi mở trang đăng ký trong tab mới.
- Nếu cấu hình không hợp lệ, mục vẫn hiển thị để người dùng biết chức năng tồn tại nhưng ở trạng thái vô hiệu hóa, có `aria-disabled="true"`, không mở trang và có nhãn giải thích cấu hình chưa sẵn sàng.
- Kích thước chạm và kiểu hiển thị bám theo các mục menu hiện có; icon và nhãn phải đọc được ở light/dark mode.

## Kiểm thử

- Unit test helper với URL hợp lệ, khoảng trắng, biến trống, URL sai và protocol không phải HTTPS.
- Lint và production build phải đạt.
- Regenerate `gas/index.html` và xác nhận artifact chứa nhãn menu cùng URL đã cấu hình.
- QA mobile xác nhận mục nằm trong drawer, mở tab mới và tab OPS FTE không bị điều hướng.

## Ngoài phạm vi

- Nhúng trang đăng ký vào iframe.
- Proxy hoặc kiểm tra quyền truy cập của Apps Script đích.
- Trang cài đặt cho phép thay URL lúc runtime.
