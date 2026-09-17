# 카카오 선물하기 랭킹 크롤러 및 B2B 인사이트 파이프라인 🎁

카카오 선물하기 랭킹 (카테고리 5: 리빙/주방/디지털/팬시 등) 데이터를 자동으로 크롤링하고, 파생 스키마 생성, 한국어 형태소/키워드 추출, 가격대 x 카테고리 매트릭스(White Space Analysis), USP 속성 비율, 라이징 아이템 감지 및 대시보드 연동용 JSON 카드를 자동 추출하는 B2B 마케팅/기획 파이프라인입니다.

---

## 📁 프로젝트 구조

```
kakao_gift_crawler/
├── main.py              # 데이터 수집, 파생 스키마 가공 및 B2B 인사이트 전체 메인 실행 파일
├── crawler.py           # Playwright 기반 Top 50~100 크롤링 동적 스크립트
├── analytics.py         # 파생 컬럼 생성, 키워드 이원화 추출, USP/White Space 분석 모듈
├── auditor.py           # 데이터 품질 검수 및 100점 점수화 감사 스크립트
├── server.py            # 대시보드 API 서버 및 로컬 웹 서버
├── requirements.txt      # 파이썬 의존성 패키지 목록
├── run_crawler.bat      # 배치 실행 파일 (main.py 자동 실행 + 로깅)
├── setup_scheduler.bat  # Windows 작업 스케줄러 자동 등록 파일 (매일 10시)
├── data/                # 일별 ranking_YYYYMMDD.csv 및 ranking_master_history.csv
├── reports/             # 품질 감사 리포트 (audit_report_YYYYMMDD.md)
└── web/                 # 웹 대시보드 및 JSON 출력 (insight_cards.json, data.json)
```

---

## 🚀 파생 수집 스키마 (Pandas DataFrame / DB)

1. `price_tier`: 가격대 구간 분류 (`'1만원 미만'`, `'1만원대'`, `'2만원대'`, `'3만원대'`, `'4만원대'`, `'5만원 이상'`)
2. `has_packaging`: 선물포장/쇼핑백/전용패키지/파우치/리본 포함 여부 (Boolean)
3. `has_engraving`: 각인/메시지/메시지카드/문구 포함 여부 (Boolean)
4. `is_exclusive`: 단독/1+1/세트/기획/증정/본품 구성 여부 (Boolean)
5. `is_new_entry`: 직전 수집 대비 신규 랭킹 진입 여부 (Boolean)
6. `rank_delta`: 직전 수집 대비 순위 변동폭 `(이전 순위 - 현재 순위)` (Integer)

---

## 📊 카테고리별 추천 키워드 모듈 (Recommended Keywords)

- **분석 범위 파라미터화**: Top 50 ~ Top 100 가변 지정 (`--top_n 100`)
- **랭킹 구간별 키워드 이원화 추출**:
  - `Top 1~30 (안정권 키워드)`: 상위권 브랜드 필수/기본 키워드
  - `Top 31~100 (트렌드/라이징 키워드)`: 중위권/급상승 상품 신규 트렌드 키워드
- **키워드 성격별 Top 5 분류**:
  - `[속성/혜택]`: 각인, 선물포장, 단독, 쇼핑백, 세트 등
  - `[타깃/시즌]`: 생일, 응원, 집들이, 답례품, 기념일 등
  - `[콘셉트/제형]`: 데스크테리어, 퍼퓸, 비건, 키링, 파우치 등

---

## 💡 대시보드 연동용 JSON 구조 (`web/insight_cards.json`)

```json
{
  "category": "팬시/문구/취미 (IP핵심)",
  "analyzed_count": 100,
  "card_1_sov": {
    "total_count": 100,
    "top_ip_share": "66.0%",
    "brand_ranks": [...]
  },
  "card_2_price_and_usp": {
    "avg_price": 14658,
    "packaging_ratio": 10.0,
    "engraving_ratio": 0.0,
    "exclusive_ratio": 14.0,
    "price_tier_matrix": {...}
  },
  "card_3_recommended_keywords": {
    "stable_keywords_top30": ["귀여운", "키링", "가나디"],
    "rising_keywords_top31_100": ["쓸데없는", "신박한", "자취"],
    "top_options": ["선물포장", "각인"],
    "by_type": {
      "attributes": ["단독", "선물포장", "각인", "쇼핑백", "세트"],
      "target_season": ["생일", "집들이", "응원", "답례품", "기념일"],
      "concept": ["데스크테리어", "퍼퓸", "비건", "키링", "파우치"]
    }
  },
  "card_4_rising_stars": [...]
}
```

---

## 💻 실행 방법

### 1. 고도화 파이프라인 실행
```cmd
py -3 main.py --top_n 100
```

### 2. 가공 데이터만 재분석 (수집 패스)
```cmd
py -3 main.py --skip_scrape
```

### 3. 데이터 품질 자체 검수 실행
```cmd
py -3 auditor.py
```

### 4. 대시보드 서버 가동
```cmd
py -3 server.py
```


## 신규 진입·순위 비교 기준
- 동일 카테고리의 상품 ID로 직전 수집일과 비교합니다. 상품명 변경은 신규 진입으로 보지 않습니다.
- ID가 없으면 카카오 상품 URL에서 ID를 추출합니다. 식별 불가·중복된 이전 기록은 비교 불가로 처리합니다.
- NEW는 직전 수집 범위 안에서 이전에 관측되지 않은 상품입니다. 신상품 출시를 의미하지 않습니다.
- 수집 범위가 Top 50에서 Top 100으로 늘어난 경우, 이전에 없던 51~100위는 비교 불가입니다.
- 급상승 카드는 10계단 이상 상승 또는 확인된 NEW만 포함합니다. 주말·미수집일을 건너뛰면 24시간 비교가 아닙니다.
- 과거 데이터 재계산: `python rebuild_rankings.py` (먼저 data/와 docs/ 백업 권장).
- 회귀 테스트: `python -m unittest discover -s tests -p "test_rank_comparison.py"`
