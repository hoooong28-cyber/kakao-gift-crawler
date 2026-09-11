import os
import sys
import re
import json
import glob
from datetime import datetime
import pandas as pd

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

# 알려진 잠재적 IP 서브 키워드 및 미등록 IP 추천 사전
CANDIDATE_IP_PATTERNS = {
    "잔망루피/뽀로로": ["루피", "잔망루피", "뽀로로", "크롱", "패티"],
    "미피": ["미피", "miffy"],
    "무민": ["무민", "moomin"],
    "짱구": ["짱구", "흰둥이", "짱구는"],
    "에스더버니": ["에스더버니", "estherbunny"],
    "마루는강쥐": ["마루는강쥐", "마루는 강쥐", "마루인형"],
    "빵빵이": ["빵빵이", "옥지"],
    "오구": ["오구", "오구오구"],
    "보노보노": ["보노보노", "포로리"],
    "몰랑": ["몰랑", "몰랑이"],
    "케어베어": ["케어베어", "carebears"],
    "지브리/토토로": ["토토로", "가오나시", "지브리", "마녀배달부", "지지"],
    "스누피/피너츠": ["스누피", "피너츠", "찰리브라운", "우드스탁"],
    "명탐정 코난": ["명탐정 코난", "명탐정코난", "코난", "괴도 키드", "괴도키드", "남도일", "안기준"],
    "메이플스토리": ["메이플", "핑크빈", "주황버섯", "돌정령"],
    "라인프렌즈/BT21": ["라인프렌즈", "BT21", "브라운", "코니", "샐리"],
    "월레스와그로밋": ["월레스", "그로밋", "숀더쉽"]
}

class IpTagAuditor:
    """
    [캐릭터 IP 태깅 정밀 감수 담당자]
    수집된 데이터 중 '기타 캐릭터/팬시' 또는 '일반/비IP 상품'으로 잘못 분류되었을 가능성이 있는
    누락된 IP 상품을 감지하고, IP 키워드 사전 자동 업데이트 가이드를 발행합니다.
    """
    def __init__(self, today_str=None):
        self.today_str = today_str or datetime.now().strftime("%Y%m%d")
        self.today_formatted = datetime.now().strftime("%Y-%m-%d")
        self.csv_file = os.path.join(DATA_DIR, f"ranking_{self.today_str}.csv")
        self.report_file = os.path.join(REPORTS_DIR, f"ip_audit_report_{self.today_str}.md")

    def run_ip_audit(self):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [IP 태깅 정밀 감수 담당자] 데이터 검수 시작...")
        
        if not os.path.exists(self.csv_file):
            print(f"  ❌ 데이터 파일이 없습니다: {self.csv_file}")
            return False

        df = pd.read_csv(self.csv_file)
        total_items = len(df)

        # 1. 태깅 분류별 현황
        ip_classified = df[~df['character_ip'].isin(["기타 캐릭터/팬시", "일반/비IP 상품"])]
        etc_classified = df[df['character_ip'] == "기타 캐릭터/팬시"]
        non_ip_classified = df[df['character_ip'] == "일반/비IP 상품"]

        # 2. '기타 캐릭터' 및 '비IP' 상품 중에서 미인식 IP 상품 추적 (Gap Detection)
        suspicious_candidates = []
        new_keyword_recommendations = {}

        # 검사 대상: 기타 캐릭터 + 비IP 상품
        unclassified_df = df[df['character_ip'].isin(["기타 캐릭터/팬시", "일반/비IP 상품"])]

        for idx, row in unclassified_df.iterrows():
            text = f"{row['brand']} {row['product_name']}".lower()
            
            # 후보 패턴 매칭
            detected_candidate = None
            matched_keyword = None
            
            for candidate_name, keywords in CANDIDATE_IP_PATTERNS.items():
                for kw in keywords:
                    if kw.lower() in text:
                        detected_candidate = candidate_name
                        matched_keyword = kw
                        break
                if detected_candidate:
                    break
            
            # 브래킷([ ]) 브랜드명 추출을 통한 신규 IP 후보 감지
            brand_in_brackets = re.findall(r'\[(.*?)\]', row['product_name'])
            
            if detected_candidate:
                suspicious_candidates.append({
                    "category": row['category'],
                    "rank": row['rank'],
                    "current_ip": row['character_ip'],
                    "suggested_ip": detected_candidate,
                    "matched_keyword": matched_keyword,
                    "brand": row['brand'],
                    "product_name": row['product_name'],
                    "price": row['price']
                })
                new_keyword_recommendations[detected_candidate] = matched_keyword

        # 3. 리포트 생성
        self.save_ip_report(total_items, ip_classified, etc_classified, non_ip_classified, suspicious_candidates, new_keyword_recommendations)
        print(f"  ✅ [IP 감수 완료] 오분류 의심 상품 {len(suspicious_candidates)}건 감지됨 | 리포트 저장: {self.report_file}")
        return True

    def save_ip_report(self, total_items, ip_classified, etc_classified, non_ip_classified, suspicious, recommendations):
        report_md = f"""# 🧸 캐릭터 IP 태깅 정밀 감수 & 사전 업데이트 보고서

- **검수 일자**: {self.today_formatted}
- **검수 담당**: 프로젝트 IP 정밀 감수 담당자 (IP-Tag Auditor Agent)
- **검수 대상 데이터**: 총 {total_items}개 항목 (4개 세부 카테고리 x Top 50)

---

## 1. 📊 IP 태깅 분류 현황
- **명확히 인식된 IP 상품**: **{len(ip_classified)}개** ({round(len(ip_classified)/total_items*100, 1)}%)
- **기타 캐릭터/팬시 분류**: **{len(etc_classified)}개** ({round(len(etc_classified)/total_items*100, 1)}%)
- **일반/비IP 상품 분류**: **{len(non_ip_classified)}개** ({round(len(non_ip_classified)/total_items*100, 1)}%)

---

## 2. 🚨 미인식 IP 오분류 의심 상품 감지 결과 ({len(suspicious)}건)

"""
        if suspicious:
            report_md += "| 카테고리 | 순위 | 현재 태그 | **추천 IP** | 감지 키워드 | 브랜드 | 상품명 |\n"
            report_md += "| :--- | :---: | :--- | :--- | :---: | :--- | :--- |\n"
            for item in suspicious:
                report_md += f"| {item['category']} | {item['rank']}위 | `{item['current_ip']}` | **{item['suggested_ip']}** | `{item['matched_keyword']}` | {item['brand']} | {item['product_name']} |\n"
            report_md += "\n"
        else:
            report_md += "✅ **누락된 IP 없음**: 미인식된 IP 상품이 발견되지 않았습니다.\n\n"

        report_md += """---

## 3. 💡 IP 사전(`IP_KEYWORDS`) 신규 등록 추천 목록

크롤러 키워드 사전에 아래 키워드를 추가하면 태깅 정밀도가 더욱 향상됩니다:

"""
        if recommendations:
            for ip, kw in recommendations.items():
                report_md += f"- **[{ip}]**: 키워드 `\"{kw}\"` 사전 등록 권장\n"
        else:
            report_md += "- 현재 사전 키워드가 최적화되어 있습니다.\n"

        report_md += """
---

## 4. 📝 IP 감수 담당자의 조치 가이드
1. 위 리포트에서 감지된 추천 IP를 `crawler.py`의 `IP_KEYWORDS` 사전에 업데이트하세요.
2. 재실행 시 해당 상품들이 자동으로 정확한 캐릭터 IP 태그로 승격됩니다.
"""

        with open(self.report_file, "w", encoding="utf-8") as f:
            f.write(report_md)

def main():
    auditor = IpTagAuditor()
    auditor.run_ip_audit()

if __name__ == "__main__":
    main()
