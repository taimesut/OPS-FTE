function submitIncidentReport(payload) {
  try {
    var output = handleIncidentReportPost_({
      postData: { contents: JSON.stringify(payload) }
    });
    var result = JSON.parse(output.getContent());
    var incidentId = payload && payload.workflow
      ? String(payload.workflow.incidentId || "").trim()
      : "";

    return {
      status: result && result.status === "success" ? "success" : "error",
      message: result && result.message
        ? String(result.message)
        : "Không nhận được kết quả lưu sự vụ.",
      incidentId: incidentId
    };
  } catch (error) {
    console.error("Incident report submit failed");
    return {
      status: "error",
      message: error && error.message
        ? String(error.message)
        : "Không thể lưu sự vụ.",
      incidentId: ""
    };
  }
}
