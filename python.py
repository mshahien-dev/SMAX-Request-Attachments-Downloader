from flask_cors import CORS
from flask import Flask, jsonify, request, send_file
import requests
import io
import urllib3
import os
import uuid


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

    global token  # Tell Python to update the global variable

    try:

        # Step 1: Get Token

        auth_url = f"{BASE_URL}/auth/authentication-endpoint/authenticate/token?TENANTID={TENANT_ID}"

        auth_payload = {"login": "root", "password": "mM123456@@"}

        auth_resp = requests.post(auth_url, json=auth_payload, verify=False)

        auth_resp.raise_for_status()

        # Save token globally

        token = auth_resp.text.replace('"', "").strip()

        # Step 2: Fetch Data from EMS

        data_url = f"{BASE_URL}/rest/{TENANT_ID}/ems/Request?layout=Id,DisplayLabel,RequestAttachments&size=100"

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

    global token  # Use the global token saved from /get-data

    if not token:

        return "Missing token. Please fetch data first.", 400

    file_url = f"{BASE_URL}/rest/{TENANT_ID}/frs/file-list/{file_id}"

    headers = {"Authorization": f"Bearer {token}", "TENANTID": TENANT_ID}

    file_resp = requests.get(file_url, headers=headers, verify=False, stream=True)

    if file_resp.status_code == 401:

        print("SMAX rejected the token!")

        return "SMAX Authentication Failed", 401

    return send_file(io.BytesIO(file_resp.content), mimetype="application/octet-stream")


@app.route("/set-download-path", methods=["POST"])
def set_download_path():
    """Set the download path for batch downloads"""
    global save_path

    data = request.json
    if data and data.get("path"):
        custom_path = data["path"].strip()
        if custom_path:
            save_path = custom_path
    # Always return success - use default if no valid custom path
    return jsonify({"message": "Download path set", "path": save_path})


@app.route("/save-file/<file_id>/<file_name>", methods=["GET"])
def save_smax_file(file_id, file_name):

    global token

    if not token:
        return jsonify({"error": "Missing token. Please fetch data first."}), 400

    file_url = f"{BASE_URL}/rest/{TENANT_ID}/frs/file-list/{file_id}"
    headers = {"Authorization": f"Bearer {token}", "TENANTID": TENANT_ID}

    file_resp = requests.get(file_url, headers=headers, verify=False, stream=True)

    if file_resp.status_code == 401:
        return jsonify({"error": "SMAX Authentication Failed"}), 401

    # Decode the filename
    import urllib.parse

    safe_name = urllib.parse.unquote(file_name)

    # Ensure save_path exists
    os.makedirs(save_path, exist_ok=True)

    file_path = os.path.join(save_path, safe_name)
    with open(file_path, "wb") as f:
        for chunk in file_resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

    return jsonify({"message": "Saved", "file": safe_name, "path": save_path})


@app.route("/downloadAll/<file_id>/<file_name>", methods=["GET"])
def download_all_smax_file(file_id, file_name):

    global token

    if not token:
        return "Missing token. Please fetch data first.", 400

    file_url = f"{BASE_URL}/rest/{TENANT_ID}/frs/file-list/{file_id}"
    headers = {"Authorization": f"Bearer {token}", "TENANTID": TENANT_ID}

    file_resp = requests.get(file_url, headers=headers, verify=False, stream=True)

    if file_resp.status_code == 401:
        return "SMAX Authentication Failed", 401

    os.makedirs(save_path, exist_ok=True)

    # IMPORTANT: sanitize filename
    safe_name = f"{uuid.uuid4()}_{file_name}"
    file_path = os.path.join(save_path, safe_name)
    with open(file_path, "wb") as f:
        for chunk in file_resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

    return jsonify({"message": "Saved", "file": safe_name})


if __name__ == "__main__":

    print("SMAX Proxy is running on http://127.0.0.1:5000")

    app.run(port=5000, debug=True)
