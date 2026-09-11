import os
import sys
import pandas as pd
import numpy as np

def enrich_dataframe(df_raw, df_prev=None):
    """
    원시 수집 데이터에 price_tier, USP 태그, rank_delta, is_new_entry 등 
    파생 스키마를 부여합니다.
    """
    df = df_raw.copy()
    
    # 1. 가격 팁 (price_tier)
    def get_price_tier(price):
        try:
            p = float(price)
            if p <= 10000:
                return "1만원 이하"
            elif p <= 30000:
                return "1~3만원대"
            elif p <= 50000:
                return "3~5만원대"
            else:
                return "5만원 이상"
        except Exception:
            return "기타"
            
    if 'price' in df.columns:
        df['price_numeric'] = pd.to_numeric(df['price'].astype(str).str.replace(",", "").str.replace("원", ""), errors='coerce').fillna(0)
        df['price_tier'] = df['price_numeric'].apply(get_price_tier)
    else:
        df['price_numeric'] = 0
        df['price_tier'] = "기타"

    # 2. USP 분석 (포장, 각인, 단독구성 등)
    def detect_usp(row):
        title = str(row.get('product_name', '')) + " " + str(row.get('brand', ''))
        usps = []
        if any(k in title for k in ["포장", "선물포장", "보자기", "패키지"]):
            usps.append("선물포장")
        if any(k in title for k in ["각인", "자수", "네임"]):
            usps.append("각인/자수")
        if any(k in title for k in ["단독", "기획", "세트", "증정"]):
            usps.append("단독구성")
        if not usps:
            usps.append("일반구성")
        return ", ".join(usps)
        
    df['usp'] = df.apply(detect_usp, axis=1)

    # 3. 과거 데이터 비교 (rank_delta, is_new_entry)
    df['rank_delta'] = 0
    df['is_new_entry'] = False
    
    if df_prev is not None and not df_prev.empty and 'product_name' in df_prev.columns and 'rank' in df_prev.columns:
        prev_map = {}
        for _, prow in df_prev.iterrows():
            key = (str(prow.get('category', '')), str(prow.get('product_name', '')))
            try:
                prev_map[key] = int(prow.get('rank', 0))
            except Exception:
                pass
                
        deltas = []
        is_news = []
        for _, row in df.iterrows():
            cat = str(row.get('category', ''))
            pname = str(row.get('product_name', ''))
            try:
                cur_rank = int(row.get('rank', 0))
            except Exception:
                cur_rank = 0
                
            prev_rank = prev_map.get((cat, pname))
            if prev_rank is not None and prev_rank > 0:
                delta = prev_rank - cur_rank  # 양수면 순위 상승
                deltas.append(delta)
                is_news.append(False)
            else:
                deltas.append("NEW")
                is_news.append(True)
                
        df['rank_delta'] = deltas
        df['is_new_entry'] = is_news

    return df

def generate_all_dashboard_cards(df_enriched, top_n=100):
    """
    각 카테고리별 B2B 마케팅 인사이트 카드를 생성합니다.
    """
    cards = {}
    categories = ["전체", "리빙 전체", "팬시/문구/취미 (IP핵심)", "침구/패브릭", "주방/식기"]
    
    for cat in categories:
        if cat == "전체":
            sub_df = df_enriched.copy()
        else:
            sub_df = df_enriched[df_enriched['category'] == cat].copy()
            
        if sub_df.empty:
            cards[cat] = {}
            continue
            
        total_count = len(sub_df)
        
        # 1. SOV
        ip_counts = sub_df[sub_df['character_ip'] != '일반/비IP 상품']['character_ip'].value_counts()
        ip_total = sub_df[sub_df['character_ip'] != '일반/비IP 상품'].shape[0]
        ip_share = f"{round((ip_total / total_count) * 100, 1)}%" if total_count > 0 else "0%"
        top_ip_name = ip_counts.index[0] if not ip_counts.empty else "없음"
        
        card_1 = {
            "top_ip_share": ip_share,
            "top_ip_name": top_ip_name,
            "ip_product_count": int(ip_total),
            "total_count": int(total_count)
        }
        
        # 2. Price & USP
        avg_price = int(sub_df['price_numeric'].mean()) if not sub_df['price_numeric'].empty else 0
        pkg_cnt = sub_df[sub_df['usp'].str.contains("선물포장", na=False)].shape[0]
        eng_cnt = sub_df[sub_df['usp'].str.contains("각인", na=False)].shape[0]
        exc_cnt = sub_df[sub_df['usp'].str.contains("단독구성", na=False)].shape[0]
        
        card_2 = {
            "avg_price": avg_price,
            "packaging_ratio": round((pkg_cnt / total_count) * 100, 1) if total_count > 0 else 0,
            "engraving_ratio": round((eng_cnt / total_count) * 100, 1) if total_count > 0 else 0,
            "exclusive_ratio": round((exc_cnt / total_count) * 100, 1) if total_count > 0 else 0
        }
        
        # 3. Keywords
        top30 = sub_df[sub_df['rank'] <= 30]
        stable_kws = list(top30['character_ip'].value_counts().head(3).index)
        
        top31_100 = sub_df[(sub_df['rank'] > 30) & (sub_df['rank'] <= 100)]
        rising_kws = list(top31_100['character_ip'].value_counts().head(3).index)
        
        card_3 = {
            "stable_keywords_top30": [k for k in stable_kws if k != "일반/비IP 상품"],
            "rising_keywords_top31_100": [k for k in rising_kws if k != "일반/비IP 상품"]
        }
        
        # 4. Rising Stars
        rising_items = []
        for _, r in sub_df.iterrows():
            if r.get('is_new_entry') or (isinstance(r.get('rank_delta'), (int, float)) and r.get('rank_delta') > 0):
                rising_items.append({
                    "brand": str(r.get('brand', '')),
                    "product_name": str(r.get('product_name', '')),
                    "rank": int(r.get('rank', 0)),
                    "rank_delta": r.get('rank_delta'),
                    "category": str(r.get('category', ''))
                })
                
        card_4 = sorted(rising_items, key=lambda x: x['rank'])[:5]
        
        cards[cat] = {
            "analyzed_count": total_count,
            "card_1_sov": card_1,
            "card_2_price_and_usp": card_2,
            "card_3_recommended_keywords": card_3,
            "card_4_rising_stars": card_4
        }
        
    return cards
