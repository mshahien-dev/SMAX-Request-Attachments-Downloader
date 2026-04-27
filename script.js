let ALL_ATTACHMENTS = [];

// DOM Elements
const tableBody = document.getElementById("table-body");
const btnLogin = document.getElementById("btn-login");
const btnDownloadAll = document.getElementById("btn-download-all");
const statusBadge = document.getElementById("status-badge");
const downloadPathInput = document.getElementById("download-path");

const API_BASE = "http://127.0.0.1:5000";

btnLogin.addEventListener("click", () => {
  statusBadge.textContent = "Logging in...";
  fetchData()
    .then(() => (btnDownloadAll.disabled = false))
    .catch(() => {
      alert("Login failed. Check your credentials or CORS settings.");
      statusBadge.textContent = "Offline";
    });
});

async function fetchData() {
  statusBadge.textContent = "Fetching via Python...";
  const response = await fetch(`${API_BASE}/get-data`);
  const data = await response.json();

  if (!data.entities) throw new Error("No data found");

  renderTable(data.entities);
  statusBadge.textContent = "Data Loaded";
  statusBadge.className = "badge online";
}

function renderTable(entities) {
  tableBody.innerHTML = "";
  ALL_ATTACHMENTS = [];

  entities.forEach((entity) => {
    const props = entity.properties;
    if (!props.RequestAttachments) return;

    const attachments = JSON.parse(
      props.RequestAttachments,
    ).complexTypeProperties;
    const attachmentHtml = attachments
      .map((att) => {
        const file = att.properties;
        ALL_ATTACHMENTS.push({
          id: file.id,
          name: file.file_name,
          requestId: props.Id,
          requestName: props.DisplayLabel,
        });
        return `<div class="attachment-item"><span>${file.file_name}</span><a href="#" class="dl-link" onclick="downloadFile('${file.id}', '${file.file_name.replace(/'/g, "\\'")}', ${props.Id}, '${props.DisplayLabel.replace(/'/g, "\\'")}')">Download</a></div>`;
      })
      .join("");

    tableBody.innerHTML += `<tr><td><strong>#${props.Id}</strong></td><td>${props.DisplayLabel}</td><td>${attachmentHtml}</td></tr>`;
  });
}

// Naming convention: <REQUEST-ID>-<REQUEST-NAME>-<ATTACHMENT-NAME>-<ATTACHMENT-ID>
function formatFileName(requestId, requestName, attachmentId, fileName) {
  const safeName = (requestName || "unknown").replace(/[^a-zA-Z0-9-_]/g, "_");
  return `${requestId}-${safeName}-${attachmentId}-${fileName}`;
}

function downloadFile(id, name, requestId, requestName) {
  const finalFileName = formatFileName(requestId, requestName, id, name);

  fetch(`${API_BASE}/download/${id}`)
    .then((resp) => {
      if (!resp.ok) throw new Error("Proxy download failed");
      return resp.blob();
    })
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    })
    .catch((err) => {
      console.error(err);
      alert("Download failed. Is the Python script running?");
    });
}

function downloadAllFile(allAttachments) {
  const customPath = downloadPathInput.value.trim() || "C:\\attachments";

  fetch(`${API_BASE}/set-download-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: customPath }),
  })
    .then((resp) => resp.json())
    .then((data) => startDownloadAll(allAttachments))
    .catch(() => {
      alert("Failed to configure download folder. Using default.");
      startDownloadAll(allAttachments);
    });
}

function startDownloadAll(allAttachments) {
  let index = 0,
    failed = 0,
    success = 0;

  function downloadNext() {
    if (index >= allAttachments.length) {
      alert(`Download complete!\nSuccess: ${success}\nFailed: ${failed}`);
      return;
    }

    const att = allAttachments[index];
    const finalFileName = formatFileName(
      att.requestId,
      att.requestName,
      att.id,
      att.name,
    );

    fetch(
      `${API_BASE}/save-file/${att.id}/${encodeURIComponent(finalFileName)}`,
    )
      .then((resp) => {
        if (!resp.ok) throw new Error();
        return resp.json();
      })
      .then(() => {
        success++;
      })
      .catch(() => {
        failed++;
      })
      .finally(() => {
        index++;
        setTimeout(downloadNext, 50);
      });
  }

  downloadNext();
}

btnDownloadAll.addEventListener("click", () => {
  if (ALL_ATTACHMENTS.length === 0) {
    alert("No attachments to download!");
    return;
  }
  downloadAllFile(ALL_ATTACHMENTS);
});
