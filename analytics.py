import os
import sys
import pandas as pd
import numpy as np
from numbers import Real
from rank_comparison import compare_rankings

PRICE_TIER_ORDER = ["1만원 미만", "1만원대", "2만원대", "3만원대", "4만원대", "5만원 이상"]

def get_price_tier(price):
    """가격(원)을 6단계 가격대 구간으로 분류합니다. (docs/app.js의 클라이언트 폴백 로직과 동일한 경계값)"""
    try:
        p = float(price)
        if p < 10000:
            return "1만원 미만"
        elif p < 20000:
            return "1만원대"
        elif p < 30000:
            return "2만원대"
        elif p < 40000:
            return "3만원대"
        elif p < 50000:
            return "4만원대"
        else:
            return "5만원 이상"
    except Exception:
        return "기타"

def enrich_dataframe(df_raw, df_prev=None):
    """
    원시 수집 데이터에 price_tier, USP 태그, rank_delta, is_new_entry 등 
    파생 스키마를 부여합니다.
    """
    df = df_raw.copy()

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

    # Match stable IDs within the same category; titles may change every crawl.
    comparison = compare_rankings(
        df.to_dict(orient="records"),
        df_prev.to_dict(orient="records") if df_prev is not None else None,
    )
    for column in ("rank_delta", "is_new_entry", "rank_comparison_status"):
        df[column] = [row[column] for row in comparison]

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
        
        # 1. SOV (순수 캐릭터 IP 기준: 기타 일반 캐릭터/팬시 항목 제외)
        non_pure_tags = ["일반/비IP 상품", "기타 캐릭터/팬시", "캐릭터/팬시-침구", "캐릭터/팬시-팬시굿즈", "캐릭터/팬시-주방"]
        pure_ip_df = sub_df[~sub_df['character_ip'].isin(non_pure_tags)]
        ip_counts = pure_ip_df['character_ip'].value_counts()
        ip_total = pure_ip_df.shape[0]
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

        # 2-1. 가격대별 White Space 매트릭스 (대시보드 Card 2 테이블용)
        price_tier_matrix = {}
        for tier in PRICE_TIER_ORDER:
            tier_df = sub_df[sub_df['price_tier'] == tier]
            tier_count = len(tier_df)
            top_brands = list(tier_df['brand'].value_counts().head(3).index) if tier_count > 0 else []
            price_tier_matrix[tier] = {
                "count": int(tier_count),
                "share": round((tier_count / total_count) * 100, 1) if total_count > 0 else 0,
                "avg_price": int(tier_df['price_numeric'].mean()) if tier_count > 0 else 0,
                "top_brands": top_brands
            }
        
        card_2 = {
            "avg_price": avg_price,
            "packaging_ratio": round((pkg_cnt / total_count) * 100, 1) if total_count > 0 else 0,
            "engraving_ratio": round((eng_cnt / total_count) * 100, 1) if total_count > 0 else 0,
            "exclusive_ratio": round((exc_cnt / total_count) * 100, 1) if total_count > 0 else 0,
            "price_tier_matrix": price_tier_matrix
        }
        
        # 3. Keywords (Top 5)
        top30 = sub_df[sub_df['rank'] <= 30]
        stable_kws = list(top30['character_ip'].value_counts().head(5).index)
        
        top31_100 = sub_df[(sub_df['rank'] > 30) & (sub_df['rank'] <= 100)]
        rising_kws = list(top31_100['character_ip'].value_counts().head(5).index)
        
        card_3 = {
            "stable_keywords_top30": [k for k in stable_kws if k != "일반/비IP 상품"],
            "rising_keywords_top31_100": [k for k in rising_kws if k != "일반/비IP 상품"],
            "top_options": ["선물포장", "각인", "단독구성"],
            "by_type": {
                "attributes": ["단독", "선물포장", "각인", "쇼핑백", "전용패키지"],
                "target_season": ["생일", "집들이", "응원", "답례품", "기념일"],
                "concept": ["귀여운", "감성", "신박한", "쓸데없는", "인테리어"]
            }
        }
        
        # 4. Rising Stars
        rising_items = []
        for _, r in sub_df.iterrows():
            if r.get('is_new_entry') or (isinstance(r.get('rank_delta'), Real) and r.get('rank_delta') >= 10):
                rising_items.append({
                    "brand": str(r.get('brand', '')),
                    "product_name": str(r.get('product_name', '')),
                    "rank": int(r.get('rank', 0)),
                    "rank_delta": r.get('rank_delta'),
                    "category": str(r.get('category', '')),
                    "price": str(r.get('price', '')),
                    "character_ip": str(r.get('character_ip', '')) or "일반/비IP 상품",
                    "url": str(r.get('url', '')),
                    "is_new_entry": bool(r.get('is_new_entry'))
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
