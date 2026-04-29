/**
 * SMAX Attachment Downloader - Frontend Script
 * Handles fetching requests, displaying attachments, and batch downloading.
 */

// =============================================================================
// Configuration
// =============================================================================

const API_BASE = "http://127.0.0.1:5000";
const DEFAULT_DOWNLOAD_PATH = "C:\\attachments";
const DOWNLOAD_DELAY_MS = 50;

// =============================================================================
// State
// =============================================================================

let allAttachments = [];

// =============================================================================
// DOM Elements
// =============================================================================

const elements = {
  tableBody: document.getElementById("table-body"),
  btnLogin: document.getElementById("btn-login"),
  btnDownloadAll: document.getElementById("btn-download-all"),
  statusBadge: document.getElementById("status-badge"),
  downloadPathInput: document.getElementById("download-path"),
  filterDisplayLabel: document.getElementById("filter-display-label"),
  filterDateFrom: document.getElementById("filter-date-from"),
  filterDateTo: document.getElementById("filter-date-to"),
};

// =============================================================================
// Event Listeners
// =============================================================================

elements.btnLogin.addEventListener("click", handleLoginClick);
elements.btnDownloadAll.addEventListener("click", handleDownloadAllClick);

// =============================================================================
// Event Handlers
// =============================================================================

async function handleLoginClick() {
  updateStatus("Logging in...");

  try {
    await fetchData();
    elements.btnDownloadAll.disabled = false;
    updateStatus("Data Loaded", "online");
  } catch (error) {
    console.error(error);
    alert("Login failed. Check your credentials or CORS settings.");
    updateStatus("Offline", "offline");
  }
}

async function handleDownloadAllClick() {
  if (allAttachments.length === 0) {
    alert("No attachments to download!");
    return;
  }

  await downloadAllFiles(allAttachments);
}

// =============================================================================
// Data Fetching
// =============================================================================

async function fetchData() {
  updateStatus("Fetching via Python...");

  const url = buildApiUrl();
  const response = await fetch(url);
  const data = await response.json();

  if (!data.entities) {
    throw new Error("No data found");
  }

  renderTable(data.entities);
}

function buildApiUrl() {
  const params = new URLSearchParams();

  const displayLabel = elements.filterDisplayLabel.value.trim();
  const dateFrom = elements.filterDateFrom.value;
  const dateTo = elements.filterDateTo.value;

  if (displayLabel) params.append("display_label", displayLabel);
  if (dateFrom) params.append("date_from", dateFrom);
  if (dateTo) params.append("date_to", dateTo);

  const queryString = params.toString();
  return queryString
    ? `${API_BASE}/get-data?${queryString}`
    : `${API_BASE}/get-data`;
}

// =============================================================================
// Rendering
// =============================================================================

function renderTable(entities) {
  elements.tableBody.innerHTML = "";
  allAttachments = [];

  entities.forEach((entity) => {
    const props = entity.properties;
    if (!props.RequestAttachments) return;

    const attachments = parseAttachments(props);
    const attachmentHtml = renderAttachments(attachments, props);

    elements.tableBody.innerHTML += `
      <tr>
        <td><strong>#${props.Id}</strong></td>
        <td>${props.DisplayLabel}</td>
        <td>${attachmentHtml}</td>
      </tr>
    `;
  });
}

function parseAttachments(props) {
  return JSON.parse(props.RequestAttachments).complexTypeProperties;
}

function renderAttachments(attachments, props) {
  return attachments
    .map((att) => {
      const file = att.properties;

      allAttachments.push({
        id: file.id,
        name: file.file_name,
        requestId: props.Id,
        requestName: props.DisplayLabel,
      });

      const safeFileName = escapeHtml(file.file_name);
      const safeDisplayLabel = escapeHtml(props.DisplayLabel);

      return `
        <div class="attachment-item">
          <span>${safeFileName}</span>
          <a href="#" class="dl-link" 
             onclick="downloadFile('${file.id}', '${safeFileName.replace(/'/g, "\\'")}', ${props.Id}, '${safeDisplayLabel.replace(/'/g, "\\'")}')">
            Download
          </a>
        </div>
      `;
    })
    .join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// =============================================================================
// File Download - Single
// =============================================================================

function downloadFile(id, name, requestId, requestName) {
  const fileName = formatFileName(requestId, requestName, id, name);

  fetch(`${API_BASE}/download/${id}`)
    .then((resp) => {
      if (!resp.ok) throw new Error("Proxy download failed");
      return resp.blob();
    })
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
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

function formatFileName(requestId, requestName, attachmentId, fileName) {
  const safeName = (requestName || "unknown").replace(/[^a-zA-Z0-9-_]/g, "_");
  return `${requestId}-${safeName}-${attachmentId}-${fileName}`;
}

// =============================================================================
// File Download - Batch
// =============================================================================

async function downloadAllFiles(attachments) {
  const customPath =
    elements.downloadPathInput.value.trim() || DEFAULT_DOWNLOAD_PATH;

  try {
    await setDownloadPath(customPath);
  } catch {
    alert("Failed to configure download folder. Using default.");
  }

  const results = await batchDownload(attachments);
  alert(
    `Download complete!\nSuccess: ${results.success}\nFailed: ${results.failed}`,
  );
}

async function setDownloadPath(path) {
  const response = await fetch(`${API_BASE}/set-download-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) throw new Error("Failed to set path");
}

async function batchDownload(attachments) {
  let index = 0;
  let success = 0;
  let failed = 0;

  const downloadNext = async () => {
    if (index >= attachments.length) {
      return { success, failed };
    }

    const att = attachments[index];
    const fileName = formatFileName(
      att.requestId,
      att.requestName,
      att.id,
      att.name,
    );

    try {
      const response = await fetch(
        `${API_BASE}/save-file/${att.id}/${encodeURIComponent(fileName)}`,
      );

      if (response.ok) {
        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    index++;
    await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_DELAY_MS));
    return downloadNext();
  };

  return downloadNext();
}

// =============================================================================
// UI Helpers
// =============================================================================

function updateStatus(text, status = "offline") {
  elements.statusBadge.textContent = text;
  elements.statusBadge.className = `badge ${status}`;
}
