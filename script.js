const TENANT_ID = "481187910";

const BASE_URL = "https://master.smax.com";

let ALL_ATTACHMENTS = [];

// DOM Elements

const tableBody = document.getElementById("table-body");

const btnLogin = document.getElementById("btn-login");

const btnDownloadAll = document.getElementById("btn-download-all");

const statusBadge = document.getElementById("status-badge");

const downloadPathInput = document.getElementById("download-path");

btnLogin.addEventListener("click", async () => {
  const username = "root";

  const password = "mM123456@@";

  statusBadge.textContent = "Logging in...";

  try {
    // Proceed to fetch the attachments

    fetchData();

    btnDownloadAll.disabled = false;
  } catch (error) {
    alert("Login failed. Check your credentials or CORS settings.");

    statusBadge.textContent = "Offline";
  }
});

async function fetchData() {
  statusBadge.textContent = "Fetching via Python...";

  try {
    // Pointing to your local Python server instead of SMAX

    const response = await fetch("http://127.0.0.1:5000/get-data");

    const data = await response.json();

    if (data.entities) {
      renderTable(data.entities);

      statusBadge.textContent = "Data Loaded";

      statusBadge.className = "badge online";
    } else {
      throw new Error("No data found");
    }
  } catch (error) {
    console.error(error);

    alert("Make sure your Python script is running!");
  }
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

    let attachmentHtml = "";

    attachments.forEach((att) => {
      const file = att.properties;

      ALL_ATTACHMENTS.push({
        id: file.id,
        name: file.file_name,
        requestId: props.Id,
        requestName: props.DisplayLabel,
      });

      attachmentHtml += `

                    <div class="attachment-item">

                        <span>${file.file_name}</span>

                        <a href="#" class="dl-link" onclick="downloadFile('${file.id}', '${file.file_name.replace(/'/g, "\\'")}', ${props.Id}, '${props.DisplayLabel.replace(/'/g, "\\'")}')">Download</a>

                    </div>

                `;
    });

    const row = `

                <tr>

                    <td><strong>#${props.Id}</strong></td>

                    <td>${props.DisplayLabel}</td>

                    <td>${attachmentHtml}</td>

                </tr>

            `;

    tableBody.innerHTML += row;
  });
}

function downloadFile(id, name, requestId, requestName) {
  console.log("Downloading via Python:", id, name);

  // Naming convention: <REQUEST-ID>-<REQUEST-NAME>-<ATTACHMENT-NAME>-<ATTACHMENT-ID>
  const safeRequestName = (requestName || "unknown").replace(
    /[^a-zA-Z0-9-_]/g,
    "_",
  );
  const finalFileName = `${requestId}-${safeRequestName}-${id}-${name}`;

  const localDownloadUrl = `http://127.0.0.1:5000/download/${id}`;

  fetch(localDownloadUrl)
    .then((resp) => {
      if (!resp.ok) throw new Error("Proxy download failed");
      return resp.blob();
    })
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
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

  // Send the download path to Python first
  fetch("http://127.0.0.1:5000/set-download-path", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: customPath }),
  })
    .then((resp) => resp.json())
    .then((data) => {
      console.log("Download path set to:", data.path);
      startDownloadAll(allAttachments);
    })
    .catch((err) => {
      console.error("Failed to set download path:", err);
      alert("Failed to configure download folder. Using default.");
      startDownloadAll(allAttachments);
    });
}

function startDownloadAll(allAttachments) {
  console.log(
    "Downloading via Python All Attachments:",
    allAttachments.length,
    "files",
  );

  let index = 0;
  let failed = 0;
  let success = 0;

  function downloadNext() {
    if (index >= allAttachments.length) {
      console.log(
        `All downloads completed! Success: ${success}, Failed: ${failed}`,
      );
      alert(`Download complete!\nSuccess: ${success}\nFailed: ${failed}`);
      return;
    }

    const att = allAttachments[index];
    const safeRequestName = (att.requestName || "unknown").replace(
      /[^a-zA-Z0-9-_]/g,
      "_",
    );
    // Naming convention: <REQUEST-ID>-<REQUEST-NAME>-<ATTACHMENT-NAME>-<ATTACHMENT-ID>
    const finalFileName = `${att.requestId}-${safeRequestName}-${att.id}-${att.name}`;

    // Send to Python backend to save directly
    const localDownloadUrl = `http://127.0.0.1:5000/save-file/${att.id}/${encodeURIComponent(finalFileName)}`;

    fetch(localDownloadUrl)
      .then((resp) => {
        if (!resp.ok) throw new Error("Proxy download failed");
        return resp.json();
      })
      .then((data) => {
        console.log(`Saved: ${data.file}`);
        success++;
        index++;
        setTimeout(downloadNext, 50);
      })
      .catch((err) => {
        console.error("Download failed for:", att.name, err);
        failed++;
        index++;
        downloadNext();
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
