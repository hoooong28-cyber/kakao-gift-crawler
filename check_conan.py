import pandas as pd

df = pd.read_csv('data/ranking_20260827.csv')
conan_df = df[df['product_name'].str.contains('코난|conan', case=False, na=False) | df['brand'].str.contains('코난|conan', case=False, na=False)]

print(f"=== 코난(Conan) 상품 검색 결과: 총 {len(conan_df)}건 ===")
if not conan_df.empty:
    for idx, r in conan_df.iterrows():
        print(f"[{r['category']}] {r['rank']}위 | 브랜드: {r['brand']} | 상품명: {r['product_name']} | 태그된 IP: {r['character_ip']}")
else:
    print("오늘자 200개 랭킹 데이터 내에는 '코난' 상품이 포함되어 있지 않습니다.")
