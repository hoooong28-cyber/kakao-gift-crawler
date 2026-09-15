import os
import sys
import glob
import json
import re
import argparse
from datetime import datetime, timedelta
import pandas as pd

from crawler import scrape_all_categories, update_master_history, BASE_DIR, DATA_DIR, WEB_DIR
from analytics import enrich_dataframe, generate_all_dashboard_cards

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def get_previous_dataset(today_str):
    """오늘 날짜 이전의 가장 최근 수집 데이터 CSV를 로드합니다."""
    csv_files = sorted(glob.glob(os.path.join(DATA_DIR, "ranking_????????.csv")), reverse=True)
    for f in csv_files:
        filename = os.path.basename(f)
        date_part = filename.replace("ranking_", "").replace(".csv", "")
        if date_part < today_str:
            try:
                df_prev = pd.read_csv(f)
                print(f"  [과거 데이터 발견]: {filename} ({len(df_prev)}개 레코드 참조)")
                return df_prev
            except Exception as e:
                print(f"  ⚠️ 과거 데이터 로드 실패 ({f}): {e}")
                
    # fallback: master history
    master_file = os.path.join(DATA_DIR, "ranking_master_history.csv")
    if os.path.exists(master_file):
        try:
            df_master = pd.read_csv(master_file)
            if 'scraped_at' in df_master.columns:
                df_master['date'] = df_master['scraped_at'].str.slice(0, 10).str.replace("-", "")
                dates = sorted(df_master['date'].unique(), reverse=True)
                for d in dates:
                    if d < today_str:
                        df_prev = df_master[df_master['date'] == d]
                        print(f"  [마스터 DB에서 과거 데이터 참조]: {d} ({len(df_prev)}개 레코드)")
                        return df_prev
        except Exception:
            pass
            
    print("  ℹ️ 비교 가능한 과거 수집 데이터가 없습니다. (신규 수집 데이터로 시작)")
    return None

def export_static_web_dataset(df_latest, latest_cards_dict):
    """GitHub Pages 등 정적 웹 호스팅 환경을 위한 누적/과거 정적 JSON 빌드 파이프라인"""
    print("🌐 [정적 웹 데이터셋 빌드] GitHub Pages 호스팅용 누적 JSON 내보내기 중...")
    
    # 1. 사용 가능한 모든 일자 목록 수집
    csv_files = sorted(glob.glob(os.path.join(DATA_DIR, "ranking_????????.csv")), reverse=True)
    dates_list = []
    
    for f in csv_files:
        m = re.search(r'ranking_(\d{8})\.csv', f)
        if m:
            d = m.group(1)
            dates_list.append({
                "date_key": d,
                "label": f"{d[:4]}-{d[4:6]}-{d[6:8]}"
            })
            
            # 과거 일자별 JSON 파일 생성 (docs/data_YYYYMMDD.json)
            try:
                df_day = pd.read_csv(f).fillna("")
                day_json_path = os.path.join(WEB_DIR, f"data_{d}.json")
                day_payload = {
                    "records": df_day.to_dict(orient="records"),
                    "cards": latest_cards_dict if d == datetime.now().strftime("%Y%m%d") else {}
                }
                with open(day_json_path, "w", encoding="utf-8") as out_f:
                    json.dump(day_payload, out_f, ensure_ascii=False, indent=2)
            except Exception as ex:
                print(f"  ⚠️ 과거 날짜({d}) 정적 JSON 생성 실패: {ex}")
                
    # 2. dates.json 내보내기 (날짜 선택 셀렉트박스용)
    dates_json_path = os.path.join(WEB_DIR, "dates.json")
    with open(dates_json_path, "w", encoding="utf-8") as f:
        json.dump(dates_list, f, ensure_ascii=False, indent=2)
    print(f"  ✅ [dates.json 저장 완료]: 총 {len(dates_list)}개 일자 목록")

    # 3. history.json 내보내기 (마스터 히스토리용)
    master_file = os.path.join(DATA_DIR, "ranking_master_history.csv")
    if os.path.exists(master_file):
        try:
            df_master = pd.read_csv(master_file).fillna("")
            history_json_path = os.path.join(WEB_DIR, "history.json")
            with open(history_json_path, "w", encoding="utf-8") as f:
                json.dump(df_master.to_dict(orient="records"), f, ensure_ascii=False, indent=2)
            print(f"  ✅ [history.json 저장 완료]: 마스터 누적 데이터 {len(df_master)}개 레코드")
        except Exception as ex:
            print(f"  ⚠️ history.json 생성 실패: {ex}")

def print_b2b_insight_report(cards_dict, top_n):
    print("\n" + "="*70)
    print(f"🚀 [B2B 마케팅/기획 인사이트 리포트] (Top 1 ~ Top {top_n} 수집 기준)")
    print("="*70)
    
    for cat_name, card in cards_dict.items():
        if not card or cat_name == "전체":
            continue
            
        sov = card.get("card_1_sov", {})
        price_usp = card.get("card_2_price_and_usp", {})
        kw = card.get("card_3_recommended_keywords", {})
        rising = card.get("card_4_rising_stars", [])
        
        print(f"\n📌 [{cat_name}] (분석 대상: {card.get('analyzed_count', 0)}개)")
        print(f"  - IP 점유율: {sov.get('top_ip_share', '0%')}")
        print(f"  - 평균 가격: {price_usp.get('avg_price', 0):,}원")
        print(f"  - USP 비중: 포장 {price_usp.get('packaging_ratio', 0)}% | 각인 {price_usp.get('engraving_ratio', 0)}% | 단독구성 {price_usp.get('exclusive_ratio', 0)}%")
        
        stable = ", ".join(kw.get("stable_keywords_top30", []))
        rising_kws = ", ".join(kw.get("rising_keywords_top31_100", []))
        print(f"  - 🏆 안정권 추천 키워드 (Top 1~30): {stable}")
        print(f"  - 📈 라이징 키워드 (Top 31~100): {rising_kws}")
        
        if rising:
            top_rising = rising[0]
            delta_str = f"+{top_rising['rank_delta']}" if isinstance(top_rising['rank_delta'], int) else top_rising['rank_delta']
            print(f"  - 🚀 대표 라이징 아이템: [{top_rising['brand']}] {top_rising['product_name']} ({top_rising['rank']}위, 변동: {delta_str})")
            
    print("\n" + "="*70)

def main():
    parser = argparse.ArgumentParser(description="카카오 선물하기 고도화 데이터 수집 & 인사이트 파이프라인")
    parser.add_argument("--top_n", type=int, default=100, help="수집 및 분석 대상 랭킹 상한 (기본값: 100)")
    parser.add_argument("--skip_scrape", action="store_true", help="수집을 건너뛰고 기존 최신 CSV 데이터로 가공만 진행")
    args = parser.parse_args()

    today_str = datetime.now().strftime("%Y%m%d")
    csv_file = os.path.join(DATA_DIR, f"ranking_{today_str}.csv")

    # 1. 수집 또는 기존 데이터 로드
    if not args.skip_scrape:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 1. 크롤링 파이프라인 시작 (Top {args.top_n})...")
        products = scrape_all_categories(top_n=args.top_n)
        if not products:
            print("[오류] 수집된 상품이 없습니다.")
            sys.exit(1)
        df_raw = pd.DataFrame(products)
    else:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 1. 스크랩 건너뛰기: 최신 CSV 읽기...")
        if os.path.exists(csv_file):
            df_raw = pd.read_csv(csv_file)
        else:
            raise RuntimeError("Today's CSV is missing; collect fresh data instead of relabeling old data.")
            
    if df_raw.empty or "scraped_at" not in df_raw.columns:
        raise RuntimeError("No dated records available; refusing to publish.")
    collected_dates = pd.to_datetime(df_raw["scraped_at"], errors="raise").dt.strftime("%Y%m%d")
    if not collected_dates.eq(today_str).all():
        raise RuntimeError("Record dates do not match today; refusing to relabel old data.")

    # 2. 과거 데이터 로드 (순위 변동 및 신규 진입 산출용)
    print("2. 과거 수집 데이터 비교 및 랭킹 변동 연산 중...")
    df_prev = get_previous_dataset(today_str)
    
    # 3. 데이터 가공 & 파생 스키마 생성
    print("3. 파생 스키마 (price_tier, USP, is_new_entry, rank_delta) 자동 생성 중...")
    df_enriched = enrich_dataframe(df_raw, df_prev)
    
    # 4. 일별 CSV 및 마스터 DB 업데이트
    df_enriched.to_csv(csv_file, index=False, encoding="utf-8-sig")
    print(f"💾 [일별 고도화 CSV 저장 완료]: {csv_file} (총 {len(df_enriched)}개 레코드)")
    
    update_master_history(df_enriched)
    
    # 5. B2B 인사이트 카드 연동용 JSON 생성
    print("4. B2B 대시보드 카드 연동용 JSON 파이프라인 가동 중...")
    cards_dict = generate_all_dashboard_cards(df_enriched, top_n=args.top_n)
    
    cards_json_path = os.path.join(WEB_DIR, "insight_cards.json")
    with open(cards_json_path, "w", encoding="utf-8") as f:
        json.dump(cards_dict, f, ensure_ascii=False, indent=2)
        
    data_json_path = os.path.join(WEB_DIR, "data.json")
    # docs/data.json 에 가공된 명세와 함께 인사이트 카드를 포함시켜 웹 UI 지원
    web_payload = {
        "records": df_enriched.fillna("").to_dict(orient="records"),
        "cards": cards_dict
    }
    with open(data_json_path, "w", encoding="utf-8") as f:
        json.dump(web_payload, f, ensure_ascii=False, indent=2)
        
    print(f"💾 [웹 대시보드 JSON 저장 완료]: {data_json_path} & {cards_json_path}")
    
    # 6. 정적 웹 배포용 누적 및 과거 데이터 빌드 내보내기
    export_static_web_dataset(df_enriched, cards_dict)
    
    # 7. 터미널 인사이트 리포트 출력
    print_b2b_insight_report(cards_dict, args.top_n)
    print("\n✅ 고도화 데이터 파이프라인 전체 과정이 성공적으로 완료되었습니다!")

if __name__ == "__main__":
    main()
