import os, glob, json, pandas as pd
os.chdir(r"C:\Users\tax\.gemini\antigravity-ide\scratch\kakao_gift_crawler")
os.makedirs("history", exist_ok=True)
os.makedirs("docs/history", exist_ok=True)
csvs = glob.glob("data/*.csv") + glob.glob("docs/data/*.csv") + glob.glob("*.csv")
for f in csvs:
    try:
        df = pd.read_csv(f)
        for col in df.columns:
            s = df[col].astype(str)
            m = s.str.extract(r"(202\d[0-1]\d[0-3]\d)")[0]
            if m.dropna().count() > len(df) * 0.3:
                df["target_date"] = m
                break
        if "target_date" in df.columns:
            for d, group in df.groupby("target_date"):
                if len(str(d)) == 8:
                    items = group.drop(columns=["target_date"], errors="ignore").to_dict(orient="records")
                    formatted_d = f"{d[:4]}-{d[4:6]}-{d[6:]}"
                    payload = {"date": formatted_d, "items": items, "data": items}
                    for fn in [f"history_{d}.json", f"history_{formatted_d}.json"]:
                        open(f"history/{fn}", "w", encoding="utf-8").write(json.dumps(payload, ensure_ascii=False, indent=2))
                        open(f"docs/history/{fn}", "w", encoding="utf-8").write(json.dumps(payload, ensure_ascii=False, indent=2))
            print(f"=== {f} 기반 13개 일자별 백데이터 JSON 완전 생성 완료 ===")
            break
    except Exception as e: print(e)
