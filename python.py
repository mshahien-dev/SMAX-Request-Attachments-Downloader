from flask_cors import CORS
from flask import Flask, jsonify, request, send_file
import io
import os
import urllib.parse
import requests
import urllib3


current_dir = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)

CORS(app)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


BASE_URL = "https://master.smax.com"

TENANT_ID = "481187910"
save_path = os.path.join(current_dir, "Downloaded Attachments")
token = ""  # Global token variable


@app.route("/get-data", methods=["GET"])
def get_smax_data():
    global token

    try:
        auth_url = f"{BASE_URL}/auth/authentication-endpoint/authenticate/token?TENANTID={TENANT_ID}"
        auth_payload = {"login": "root", "password": "mM123456@@"}
        auth_resp = requests.post(auth_url, json=auth_payload, verify=False)
        auth_resp.raise_for_status()
        token = auth_resp.text.replace('"', "").strip()

        data_url = f"{BASE_URL}/rest/{TENANT_ID}/ems/Request?layout=Id,DisplayLabel,RequestAttachments&size=1000000"
        headers = {
            "Authorization": f"Bearer {token}",
            "TENANTID": TENANT_ID,
            "Content-Type": "application/json",
        }
        data_resp = requests.get(data_url, headers=headers, verify=False)
        data_resp.raise_for_status()
        return jsonify(data_resp.json())

    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 500


@app.route("/download/<file_id>", methods=["GET"])
def download_smax_file(file_id):
    global token

    if not token:
        return "Missing token. Please fetch data first.", 400

    file_url = f"{BASE_URL}/rest/{TENANT_ID}/frs/file-list/{file_id}"
    headers = {"Authorization": f"Bearer {token}", "TENANTID": TENANT_ID}
    file_resp = requests.get(file_url, headers=headers, verify=False, stream=True)

    if file_resp.status_code == 401:
        return "SMAX Authentication Failed", 401

    return send_file(io.BytesIO(file_resp.content), mimetype="application/octet-stream")


@app.route("/set-download-path", methods=["POST"])
def set_download_path():
    global save_path
    data = request.json
    if data and data.get("path"):
        custom_path = data["path"].strip()
        if custom_path:
            save_path = custom_path
    return jsonify({"message": "Download path set", "path": save_path})


@app.route("/save-file/<file_id>/<file_name>", methods=["GET"])
def save_smax_file(file_id, file_name):
    """Save file to disk with naming convention: <REQUEST-ID>-<REQUEST-NAME>-<ATTACHMENT-NAME>-<ATTACHMENT-ID>"""
    global token

    if not token:
        return jsonify({"error": "Missing token. Please fetch data first."}), 400

    file_url = f"{BASE_URL}/rest/{TENANT_ID}/frs/file-list/{file_id}"
    headers = {"Authorization": f"Bearer {token}", "TENANTID": TENANT_ID}
    file_resp = requests.get(file_url, headers=headers, verify=False, stream=True)

    if file_resp.status_code == 401:
        return jsonify({"error": "SMAX Authentication Failed"}), 401

    safe_name = urllib.parse.unquote(file_name)
    os.makedirs(save_path, exist_ok=True)
    file_path = os.path.join(save_path, safe_name)

    with open(file_path, "wb") as f:
        for chunk in file_resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

    return jsonify({"message": "Saved", "file": safe_name, "path": save_path})


if __name__ == "__main__":
    app.run(port=5000, debug=True)
