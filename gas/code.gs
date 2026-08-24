var ACCESS_SHEET_NAME = "account";
var ACCESS_EMAIL_COLUMN = 1;
var ACCESS_FIRST_DATA_ROW = 2;
var VERSION_SHEET_NAME = "VERSION";

function getAppVersionInfo() {
  var emptyVersionInfo = { version: "", updateContent: "" };

  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(VERSION_SHEET_NAME);
    if (!sheet) {
      return emptyVersionInfo;
    }

    var values = sheet.getRange(2, 1, 1, 2).getDisplayValues();
    var row = values && values[0] ? values[0] : [];
    return {
      version: String(row[0] || "").trim(),
      updateContent: String(row[1] || "").trim()
    };
  } catch (error) {
    console.error("Version info read failed");
    return emptyVersionInfo;
  }
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function getAllowedEmails_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(ACCESS_SHEET_NAME);

  if (!sheet) {
    throw new Error("Access sheet is missing");
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < ACCESS_FIRST_DATA_ROW) {
    return [];
  }

  return sheet
    .getRange(
      ACCESS_FIRST_DATA_ROW,
      ACCESS_EMAIL_COLUMN,
      lastRow - ACCESS_FIRST_DATA_ROW + 1,
      1
    )
    .getDisplayValues()
    .map(function (row) {
      return normalizeEmail_(row[0]);
    })
    .filter(function (email) {
      return email !== "";
    });
}

function getCurrentUserAccess_() {
  var email = "";

  try {
    email = normalizeEmail_(Session.getActiveUser().getEmail());
    if (!email) {
      return { allowed: false, email: "", reason: "EMAIL_UNAVAILABLE" };
    }

    var allowed = getAllowedEmails_().indexOf(email) !== -1;
    return {
      //allowed: allowed,
      allowed: true,
      email: email,
      reason: allowed ? "AUTHORIZED" : "NOT_LISTED"
    };
  } catch (error) {
    console.error("Access check failed");
    return { allowed: false, email: email, reason: "ACCESS_CHECK_FAILED" };
  }
}

function escapeHtml_(value) {
  return String(value || "").replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[character];
  });
}

function createAccessDeniedOutput_(access) {
  var accountMessage = access.email
    ? "Tài khoản hiện tại: <strong>" + escapeHtml_(access.email) + "</strong>"
    : "Không xác định được email đăng nhập. Hãy mở lại bằng tài khoản công ty.";

  var html = [
    "<!doctype html>",
    '<html lang="vi">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>Không có quyền truy cập</title>",
    "<style>",
    "*{box-sizing:border-box}",
    "body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,rgba(21,38,54,.035) 25%,transparent 25%) 0 0/16px 16px,#f3f5f7;color:#17212b;font-family:Arial,sans-serif}",
    ".card{width:min(100%,430px);overflow:hidden;padding:0 24px 32px;background:#fff;border:1px solid #dce1e5;border-radius:9px;box-shadow:0 20px 50px rgba(30,43,56,.13);text-align:center}",
    ".rail{height:8px;margin:0 -24px 26px;background:repeating-linear-gradient(-45deg,#ee4d2d 0 11px,#ffb19f 11px 19px)}",
    ".eyebrow{margin:0 0 12px;color:#d94327;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}",
    ".icon{width:64px;height:64px;margin:0 auto 20px;display:grid;place-items:center;border-radius:50%;background:#fff0ed;color:#d94327;font-size:32px;font-weight:800}",
    "h1{margin:0 0 14px;font-size:1.75rem}",
    "p{margin:10px 0;color:#596773;line-height:1.55;overflow-wrap:anywhere}",
    "strong{color:#17212b}",
    ".help{margin-top:22px;padding-top:18px;border-top:1px solid #e4e8eb;font-size:.9rem}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="card">',
    '<div class="rail" aria-hidden="true"></div>',
    '<p class="eyebrow">OPS FTE · Kiểm soát truy cập</p>',
    '<div class="icon" aria-hidden="true">!</div>',
    "<h1>Không có quyền truy cập</h1>",
    "<p>" + accountMessage + "</p>",
    '<p class="help">Liên hệ quản trị viên để thêm email vào danh sách được phép.</p>',
    "</main>",
    "</body>",
    "</html>"
  ].join("");

  return HtmlService.createHtmlOutput(html)
    .setTitle("Không có quyền truy cập")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

function doGet() {
  var access = getCurrentUserAccess_();
  if (!access.allowed) {
    return createAccessDeniedOutput_(access);
  }

  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("OPS FTE")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
  Hàm Proxy Server-side gọi API Shopee qua UrlFetchApp của Google Apps Script
  Giúp trình duyệt di động (iOS/Android/PDA) vượt rào CORS 100% không bị chặn
 */
function fetchShopeeApi(endpoint, cookie, method, bodyData) {
  var access = getCurrentUserAccess_();
  if (!access.allowed) {
    return {
      status: 403,
      error: "Bạn không có quyền sử dụng chức năng này."
    };
  }

  var url = "https://spx.shopee.vn" + endpoint;
  var httpMethod = (method || "get").toLowerCase();

  var options = {
    method: httpMethod,
    headers: {
      "Cookie": cookie || "",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*"
    },
    muteHttpExceptions: true
  };

  if (bodyData && httpMethod !== "get") {
    options.payload = typeof bodyData === "string" ? bodyData : JSON.stringify(bodyData);
  }

  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var contentText = response.getContentText();
    var parsedData = {};

    try {
      parsedData = JSON.parse(contentText);
    } catch (e) {
      parsedData = { raw: contentText };
    }

    return {
      status: responseCode,
      data: parsedData
    };
  } catch (err) {
    return {
      status: 500,
      error: err.toString()
    };
  }
}

/**
  Hàm xử lý nhận dữ liệu Log Biên Bản Sự Vụ gửi về từ Web App
  Dữ liệu JSON POST tới gồm:
  - lhTrip: Mã chuyến xe (Cột 1)
  - incidentLogs: Chuỗi đơn sự vụ định dạng "Mã đơn 1@lí do#Mã đơn 2@lí do" (Cột 2)
 */
function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var lhTrip = contents.lhTrip || "";
    var incidentLogs = contents.incidentLogs || "";

    // Mở Google Sheet hiện tại (hoặc Sheet "LogSutVu")
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("LogSutVu") || ss.getActiveSheet();

    // Nếu trang tính chưa có tiêu đề cột, tạo tiêu đề ở dòng 1
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["LH TRIP", "Đơn sự vụ"]);
    }

    // Ghi thêm dòng mới gồm 2 cột chuẩn
    sheet.appendRow([lhTrip, incidentLogs]);

    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", message: "Đã lưu log thành công!" })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
