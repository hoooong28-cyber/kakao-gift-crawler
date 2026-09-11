import os
import sys
import glob
import json
import re
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import pandas as pd

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
WEB_DIR = os.path.join(BASE_DIR, "web")

def get_available_dates():
    """사용 가능한 날짜 목록 반환 (내림차순)"""
    csv_files = sorted(glob.glob(os.path.join(DATA_DIR, "ranking_????????.csv")), reverse=True)
    dates = []
    for f in csv_files:
        m = re.search(r'ranking_(\d{8})\.csv', f)
        if m:
            d = m.group(1)
            dates.append({
                "date_key": d,
                "label": f"{d[:4]}-{d[4:6]}-{d[6:8]}"
            })
    return dates

def get_data_by_date(date_key=None):
    """특정 날짜 또는 최신 날짜의 데이터를 반환"""
    if date_key:
        csv_file = os.path.join(DATA_DIR, f"ranking_{date_key}.csv")
    else:
        csv_files = sorted(glob.glob(os.path.join(DATA_DIR, "ranking_????????.csv")), reverse=True)
        if not csv_files:
            return []
        csv_file = csv_files[0]
    
    if not os.path.exists(csv_file):
        return []
    
    try:
        df = pd.read_csv(csv_file)
        df = df.fillna("")
        return df.to_dict(orient="records")
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return []

def get_master_history():
    master_file = os.path.join(DATA_DIR, "ranking_master_history.csv")
    if not os.path.exists(master_file):
        return []
    try:
        df = pd.read_csv(master_file)
        df = df.fillna("")
        return df.to_dict(orient="records")
    except Exception as e:
        print(f"Error reading master history: {e}")
        return []


class DashboardHTTPRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == "/api/data":
            date_key = params.get("date", [None])[0]
            data = get_data_by_date(date_key)
            self._send_json(data)

        elif parsed.path == "/api/dates":
            dates = get_available_dates()
            self._send_json(dates)

        elif parsed.path == "/api/history":
            data = get_master_history()
            self._send_json(data)

        else:
            super().do_GET()

    def _send_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # 로그 출력 억제


def run_server(port=8500):
    # 최신 데이터로 data.json 갱신
    data = get_data_by_date()
    data_json_path = os.path.join(WEB_DIR, "data.json")
    with open(data_json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    server_address = ("", port)
    httpd = HTTPServer(server_address, DashboardHTTPRequestHandler)
    url = f"http://localhost:{port}"

    print("\n" + "="*60)
    print(f"[알림] 카카오 선물 캐릭터 IP 랭킹 웹 대시보드 서버가 가동 중입니다!")
    print(f"[접속 주소]: {url}")
    print(f"[API] /api/data?date=YYYYMMDD  - 특정 날짜 데이터")
    print(f"[API] /api/dates               - 수집된 날짜 목록")
    print("="*60 + "\n")

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버가 종료되었습니다.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
