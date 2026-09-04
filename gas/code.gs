var ACCESS_SHEET_NAME = "account";
var ACCESS_EMAIL_COLUMN = 1;
var ACCESS_FIRST_DATA_ROW = 2;
var VERSION_SHEET_NAME = "VERSION";
var STATION_CATALOG_SHEET_NAME = "LIST SOC";
var STATION_CATALOG_FIRST_DATA_ROW = 2;

function stationKey_(value) {
  return String(value || "").trim().toLowerCase();
}

function getStationCatalogSource_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(STATION_CATALOG_SHEET_NAME);
  if (!sheet) {
    throw new Error('Không tìm thấy sheet "LIST SOC".');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < STATION_CATALOG_FIRST_DATA_ROW) {
    throw new Error('Sheet "LIST SOC" chưa có dữ liệu SOC.');
  }

  var values = sheet
    .getRange(
      STATION_CATALOG_FIRST_DATA_ROW,
      1,
      lastRow - STATION_CATALOG_FIRST_DATA_ROW + 1,
      4
    )
    .getDisplayValues();
  var rows = [];
  var names = Object.create(null);
  var codes = Object.create(null);
  var ids = Object.create(null);

  values.forEach(function (valuesRow, index) {
    var sheetRow = index + STATION_CATALOG_FIRST_DATA_ROW;
    var row = {
      stationName: String(valuesRow[0] || "").trim(),
      stationCode: String(valuesRow[1] || "").trim(),
      id: String(valuesRow[2] || "").trim(),
      numberPrefix: String(valuesRow[3] || "").trim(),
      sheetRow: sheetRow
    };

    if (!row.stationName && !row.stationCode && !row.id && !row.numberPrefix) {
      return;
    }
    if (!row.stationName || !row.stationCode || !row.id) {
      throw new Error(
        "LIST SOC hàng " + sheetRow +
        " thiếu station_name, station_code hoặc id."
      );
    }

    var nameKey = stationKey_(row.stationName);
    var codeKey = stationKey_(row.stationCode);
    if (names[nameKey]) {
      throw new Error("station_name bị trùng tại hàng " + sheetRow + ".");
    }
    if (codes[codeKey]) {
      throw new Error("station_code bị trùng tại hàng " + sheetRow + ".");
    }
    if (ids[row.id]) {
      throw new Error("id SOC bị trùng tại hàng " + sheetRow + ".");
    }

    names[nameKey] = true;
    codes[codeKey] = true;
    ids[row.id] = true;
    rows.push(row);
  });

  if (!rows.length) {
    throw new Error('Sheet "LIST SOC" chưa có dữ liệu SOC.');
  }

  return { sheet: sheet, rows: rows };
}

function parseStationHubs_(value, sheetRow) {
  var names = Object.create(null);
  var codes = Object.create(null);
  var ids = Object.create(null);

  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(function (line) {
      return line !== "";
    })
    .map(function (line, index) {
      var parts = line.split("|").map(function (part) {
        return part.trim();
      });
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        throw new Error(
          "LIST SOC hàng " + sheetRow + ", dòng Hub " + (index + 1) +
          " phải có dạng Tên | Mã | ID."
        );
      }

      var nameKey = stationKey_(parts[0]);
      var codeKey = stationKey_(parts[1]);
      if (names[nameKey] || codes[codeKey] || ids[parts[2]]) {
        throw new Error(
          "LIST SOC hàng " + sheetRow + ", dòng Hub " + (index + 1) +
          " bị trùng tên, mã hoặc ID."
        );
      }

      names[nameKey] = true;
      codes[codeKey] = true;
      ids[parts[2]] = true;
      return {
        stationName: parts[0],
        stationCode: parts[1],
        id: parts[2]
      };
    });
}

function getStationCatalog() {
  var source = getStationCatalogSource_();
  return source.rows.map(function (row) {
    return {
      stationName: row.stationName,
      stationCode: row.stationCode,
      id: row.id,
      numberPrefix: row.numberPrefix
    };
  });
}

function getStationHubs(socId) {
  var source = getStationCatalogSource_();
  var normalizedId = String(socId || "").trim();
  var matches = source.rows.filter(function (row) {
    return row.id === normalizedId;
  });

  if (matches.length !== 1) {
    throw new Error(
      'SOC ID "' + normalizedId + '" không tồn tại duy nhất trong LIST SOC.'
    );
  }

  var selected = matches[0];
  var hubText = source.sheet.getRange(selected.sheetRow, 5).getDisplayValue();
  return parseStationHubs_(hubText, selected.sheetRow);
}

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
var API_ERROR_LOG_TEXT_LIMIT_ = 4000;
var API_ERROR_LOG_REDACTED_ = "[REDACTED]";
var API_ERROR_LOG_TRUNCATED_ = "[TRUNCATED]";

function normalizeApiLogKey_(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveApiLogKey_(key) {
  return [
    "cookie", "setcookie", "authorization", "proxyauthorization",
    "token", "accesstoken", "refreshtoken", "xshopeecookie", "apikey"
  ].indexOf(normalizeApiLogKey_(key)) !== -1;
}

function truncateApiLogText_(value) {
  var text = String(value == null ? "" : value);
  if (text.length <= API_ERROR_LOG_TEXT_LIMIT_) return text;
  return text.slice(
    0,
    API_ERROR_LOG_TEXT_LIMIT_ - API_ERROR_LOG_TRUNCATED_.length
  ) + API_ERROR_LOG_TRUNCATED_;
}

function parseGasApiLogBody_(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function sanitizeGasApiLogNested_(value, ancestors, depth) {
  if (typeof value === "string") return truncateApiLogText_(value);
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "object") return "[" + typeof value + "]";
  if (ancestors.indexOf(value) !== -1) return "[Circular]";
  if (depth >= 8) return "[MaxDepth]";

  var nextAncestors = ancestors.concat([value]);
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return sanitizeGasApiLogNested_(item, nextAncestors, depth + 1);
    });
  }

  var result = {};
  Object.keys(value).forEach(function (key) {
    result[key] = isSensitiveApiLogKey_(key)
      ? API_ERROR_LOG_REDACTED_
      : sanitizeGasApiLogNested_(value[key], nextAncestors, depth + 1);
  });
  return result;
}

function sanitizeGasApiLogValue_(value) {
  try {
    var sanitized = sanitizeGasApiLogNested_(
      parseGasApiLogBody_(value),
      [],
      0
    );
    var serialized = JSON.stringify(sanitized);
    if (!serialized || serialized.length <= API_ERROR_LOG_TEXT_LIMIT_) {
      return sanitized;
    }
    return { truncated: true, preview: truncateApiLogText_(serialized) };
  } catch (error) {
    return "[Unserializable]";
  }
}

function createGasApiErrorRecord_(details) {
  var now = Date.now();
  var error = details.error;
  return {
    source: "gas",
    timestamp: new Date(now).toISOString(),
    requestId: String(details.requestId || "gas-untracked"),
    method: String(details.method || "get").toUpperCase(),
    endpoint: String(details.endpoint || "unknown"),
    status: typeof details.status === "number" ? details.status : null,
    durationMs: Math.max(0, now - Number(details.startedAtMs || now)),
    payload: sanitizeGasApiLogValue_(details.payload),
    response: sanitizeGasApiLogValue_(details.response),
    error: {
      name: error && error.name ? String(error.name) : "ApiError",
      message: truncateApiLogText_(
        error && error.message ? error.message : details.message || "SPX API error"
      )
    },
    stack: truncateApiLogText_(error && error.stack ? error.stack : "")
  };
}

function safeLogGasApiError_(details) {
  try {
    console.error(JSON.stringify(createGasApiErrorRecord_(details)));
  } catch (error) {
    try {
      console.error(JSON.stringify({
        source: "gas",
        requestId: String(details.requestId || "gas-untracked"),
        method: String(details.method || "get").toUpperCase(),
        endpoint: String(details.endpoint || "unknown"),
        error: "API error logging failed"
      }));
    } catch (ignored) {
      // Logging must not change proxy behavior.
    }
  }
}

function fetchShopeeApi(endpoint, cookie, method, bodyData, requestId) {
  var startedAtMs = Date.now();
  var httpMethod = (method || "get").toLowerCase();
  var access = getCurrentUserAccess_();
  if (!access.allowed) {
    safeLogGasApiError_({
      requestId: requestId,
      method: httpMethod,
      endpoint: endpoint,
      status: 403,
      startedAtMs: startedAtMs,
      payload: bodyData,
      response: null,
      message: "Access denied"
    });
    return {
      status: 403,
      error: "Bạn không có quyền sử dụng chức năng này."
    };
  }

  var url = "https://spx.shopee.vn" + endpoint;

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

    if (responseCode < 200 || responseCode >= 300) {
      safeLogGasApiError_({
        requestId: requestId,
        method: httpMethod,
        endpoint: endpoint,
        status: responseCode,
        startedAtMs: startedAtMs,
        payload: bodyData,
        response: parsedData,
        message: "SPX returned HTTP " + responseCode
      });
    }

    return {
      status: responseCode,
      data: parsedData
    };
  } catch (err) {
    safeLogGasApiError_({
      requestId: requestId,
      method: httpMethod,
      endpoint: endpoint,
      status: null,
      startedAtMs: startedAtMs,
      payload: bodyData,
      response: null,
      error: err
    });
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
