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


# ── 시계열 추이 엔진 ──────────────────────────────────────────────────────
# IP 전용이 아니라 범용으로 설계: group_by 컬럼만 바꾸면 브랜드별/가격대별/
# 카테고리별 추이 등으로 그대로 재사용 가능하다.
#
# "기타 캐릭터/팬시"(라벨링 미비로 뭉뚱그려진 항목)와 "일반/비IP 상품"(진짜
# 비IP 상품)은 하나의 진짜 IP처럼 취급하면 추이가 왜곡되므로, 개별 IP
# 라인과 분리된 "미분류 참고선"으로만 별도 표시한다. NON_ENTITY_LABELS에
# 나열된 값은 항상 개별 라인이 아니라 참고선(reference_only=True)으로
# 내려간다.

NON_ENTITY_LABELS = {"일반/비IP 상품", "기타 캐릭터/팬시", "기타"}

def compute_trend(df_master, group_by="character_ip", metric="share",
                   date_col="scraped_at", category_col="category",
                   price_col="price_numeric", top_n_entities=None):
    """
    df_master: 여러 날짜가 누적된 마스터 히스토리 데이터프레임
               (crawler.update_master_history가 만드는 ranking_master_history.csv
                또는 docs/history.json을 읽어 만든 데이터프레임)
    group_by:  추이를 낼 기준 컬럼. "character_ip"(기본), "brand", "price_tier" 등
               다른 컬럼으로 바꿔도 그대로 동작한다.
    metric:    "share"(그룹 내 비중 %), "count"(등장 개수), "avg_price"(평균가) 중 하나.

    반환 형식:
    {
      "<category 값>": {
        "<group_by 값>": [
          {"date": "20260827", "count": 10, "share": 20.0, "avg_price": 15000},
          ...
        ],
        ...
        "__미분류__": [...]   # NON_ENTITY_LABELS에 해당하는 항목들의 합산치
      },
      ...
    }
    "전체"는 카테고리 구분 없이 전체를 합산한 결과.
    """
    df = df_master.copy()

    if date_col not in df.columns:
        return {}
    df['_date'] = pd.to_datetime(df[date_col], errors='coerce').dt.strftime('%Y%m%d')
    df = df[df['_date'].notna()]

    if price_col not in df.columns:
        if 'price' in df.columns:
            df[price_col] = pd.to_numeric(
                df['price'].astype(str).str.replace(",", "").str.replace("원", ""),
                errors='coerce'
            ).fillna(0)
        else:
            df[price_col] = 0

    if group_by not in df.columns:
        return {}

    # character_ip처럼 콤마로 여러 값이 합쳐진 경우(예: "가나디, 산리오") 개별 값으로 분리
    df['_group_list'] = df[group_by].astype(str).apply(
        lambda v: [g.strip() for g in v.split(',') if g.strip()] or ["기타"]
    )
    df_exploded = df.explode('_group_list')

    def build_category_trend(sub_df):
        result = {}
        total_by_date = sub_df.groupby('_date').size()
        grouped = sub_df.groupby(['_date', '_group_list'])
        agg = grouped.agg(count=('_group_list', 'size'),
                           avg_price=(price_col, 'mean')).reset_index()

        for entity, entity_df in agg.groupby('_group_list'):
            series = []
            for _, row in entity_df.sort_values('_date').iterrows():
                date_total = total_by_date.get(row['_date'], 0)
                share = round((row['count'] / date_total) * 100, 1) if date_total else 0
                series.append({
                    "date": row['_date'],
                    "count": int(row['count']),
                    "share": float(share),
                    "avg_price": int(row['avg_price']) if pd.notna(row['avg_price']) else 0
                })
            result[entity] = series
        return result

    # 미분류(NON_ENTITY_LABELS)는 합쳐서 "__미분류__" 하나로 별도 집계
    def merge_non_entities(result):
        if not any(label in result for label in NON_ENTITY_LABELS):
            return result
        merged_by_date = {}
        for label in list(result.keys()):
            if label in NON_ENTITY_LABELS:
                for point in result.pop(label):
                    d = point['date']
                    acc = merged_by_date.setdefault(d, {"count": 0, "price_sum": 0.0})
                    acc['count'] += point['count']
                    acc['price_sum'] += point['avg_price'] * point['count']
        if merged_by_date:
            series = []
            for d, acc in sorted(merged_by_date.items()):
                date_total = int(total_by_date_global.get(d, 0)) if total_by_date_global is not None and len(total_by_date_global) > 0 else 0
                share = round((acc['count'] / date_total) * 100, 1) if date_total else 0
                avg_price = int(acc['price_sum'] / acc['count']) if acc['count'] else 0
                series.append({"date": d, "count": int(acc['count']), "share": float(share), "avg_price": avg_price})
            result["__미분류__"] = series
        return result

    trends = {}
    for cat, cat_df in df_exploded.groupby(category_col):
        total_by_date_global = cat_df.groupby('_date').size()
        result = build_category_trend(cat_df)
        result = merge_non_entities(result)
        trends[str(cat)] = result

    total_by_date_global = df_exploded.groupby('_date').size()
    overall = build_category_trend(df_exploded)
    overall = merge_non_entities(overall)
    trends["전체"] = overall

    if top_n_entities:
        for cat, entities in trends.items():
            named = {k: v for k, v in entities.items() if k != "__미분류__"}
            top_keys = sorted(named, key=lambda k: sum(p['count'] for p in named[k]), reverse=True)[:top_n_entities]
            pruned = {k: entities[k] for k in top_keys}
            if "__미분류__" in entities:
                pruned["__미분류__"] = entities["__미분류__"]
            trends[cat] = pruned

    return trends


def compute_ip_trends(df_master, top_n_entities=15):
    """character_ip 기준 점유율/가격 추이. compute_trend의 얇은 래퍼."""
    return compute_trend(df_master, group_by="character_ip", metric="share",
                          top_n_entities=top_n_entities)

