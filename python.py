"""
SMAX Attachment Downloader - Flask Backend
Provides API endpoints to fetch requests and download attachments from Micro Focus SMAX.
"""

import os
import io
import urllib.parse
from datetime import datetime, timezone

import requests
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS


# =============================================================================
# Configuration
# =============================================================================

app = Flask(__name__)
CORS(app)

# SMAX API Configuration
BASE_URL = "https://master.smax.com"
TENANT_ID = "481187910"
API_USERNAME = "root"
API_PASSWORD = "mM123456@@"

# Local storage configuration
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SAVE_PATH = os.path.join(CURRENT_DIR, "Downloaded Attachments")

# Global state
save_path = DEFAULT_SAVE_PATH
auth_token = ""


# =============================================================================
# Helper Functions
# =============================================================================

def authenticate() -> str:
    """Authenticate with SMAX API and return the auth token."""
    auth_url = f"{BASE_URL}/auth/authentication-endpoint/authenticate/token?TENANTID={TENANT_ID}"
    payload = {"login": API_USERNAME, "password": API_PASSWORD}
    
    response = requests.post(auth_url, json=payload, verify=False)
    response.raise_for_status()
    
    return response.text.replace('"', "").strip()


def build_filter_query(display_label: str, date_from: str, date_to: str) -> str:
    """Build filter query string from user-provided filters."""
    filter_parts = []
    
    if display_label:
        escaped = display_label.replace("'", "''")
        filter_parts.append(f"DisplayLabel='{escaped}'")
    
    if date_from and date_to:
        from_ts = convert_to_unix_timestamp(date_from)
        to_ts = convert_to_unix_timestamp(date_to)
        if from_ts and to_ts:
            filter_parts.append(f"CreateTime btw ({from_ts}, {to_ts})")
    
    if filter_parts:
        return f"({(' and '.join(filter_parts))})"
    return ""


def convert_to_unix_timestamp(date_str: str) -> int:
    """Convert YYYY-MM-DD date string to Unix timestamp in milliseconds."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except (ValueError, TypeError) as e:
        print(f"Date conversion error: {e}")
        return None


def get_auth_headers(token: str) -> dict:
    """Return common headers for SMAX API requests."""
    return {
        "Authorization": f"Bearer {token}",
        "TENANTID": TENANT_ID,
        "Content-Type": "application/json",
    }


# =============================================================================
# API Routes
# =============================================================================

@app.route("/get-data", methods=["GET"])
def get_smax_data():
    """Fetch requests from SMAX with optional filters."""
    global auth_token
    
    # Extract filter parameters
    display_label = request.args.get("display_label", "").strip()
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()
    
    try:
        # Authenticate
        auth_token = authenticate()
        
        # Build request URL
        url = f"{BASE_URL}/rest/{TENANT_ID}/ems/Request"
        params = {
            "layout": "Id,DisplayLabel,RequestAttachments",
            "size": "1000000",
        }
        
        # Add filter if provided
        filter_query = build_filter_query(display_label, date_from, date_to)
        if filter_query:
            params["filter"] = filter_query
        
        # Fetch data
        headers = get_auth_headers(auth_token)
        response = requests.get(url, headers=headers, params=params, verify=False)
        response.raise_for_status()
        
        return jsonify(response.json())
    
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 500


@app.route("/download/<file_id>", methods=["GET"])
def download_file(file_id: str):
    """Stream a file from SMAX to the browser."""
    global auth_token
    
    if not auth_token:
        return "Missing token. Please fetch data first.", 400
    
    url = f"{BASE_URL}/rest/{TENANT_ID}/frs/file-list/{file_id}"
    headers = get_auth_headers(auth_token)
    
    response = requests.get(url, headers=headers, verify=False, stream=True)
    
    if response.status_code == 401:
        return "SMAX Authentication Failed", 401
    
    return send_file(
        io.BytesIO(response.content),
        mimetype="application/octet-stream"
    )


@app.route("/set-download-path", methods=["POST"])
def set_download_path():
    """Set custom download path for batch downloads."""
    global save_path
    
    data = request.json or {}
    custom_path = data.get("path", "").strip()
    
    if custom_path:
        save_path = custom_path
    
    return jsonify({"message": "Download path set", "path": save_path})


@app.route("/save-file/<file_id>/<file_name>", methods=["GET"])
def save_file(file_id: str, file_name: str):
    """Save a file from SMAX to the local filesystem."""
    global auth_token
    
    if not auth_token:
        return jsonify({"error": "Missing token. Please fetch data first."}), 400
    
    url = f"{BASE_URL}/rest/{TENANT_ID}/frs/file-list/{file_id}"
    headers = get_auth_headers(auth_token)
    
    response = requests.get(url, headers=headers, verify=False, stream=True)
    
    if response.status_code == 401:
        return jsonify({"error": "SMAX Authentication Failed"}), 401
    
    # Save file
    safe_name = urllib.parse.unquote(file_name)
    os.makedirs(save_path, exist_ok=True)
    file_path = os.path.join(save_path, safe_name)
    
    with open(file_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
    
    return jsonify({"message": "Saved", "file": safe_name, "path": save_path})


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    # Disable SSL warnings for self-signed certificates
    requests.packages.urllib3.disable_warnings(requests.packages.urllib3.exceptions.InsecureRequestWarning)
    app.run(port=5000, debug=True)
