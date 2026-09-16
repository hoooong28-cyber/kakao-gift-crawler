import os, glob, json, re, pandas as pd
os.chdir(r"C:\Users\tax\.gemini\antigravity-ide\scratch\kakao_gift_crawler")
csvs = glob.glob("data/*.csv") + glob.glob("docs/data/*.csv") + glob.glob("*.csv")
if csvs:
    df = pd.concat([pd.read_csv(f) for f in csvs], ignore_index=True)
    date_col = [c for c in df.columns if any(k in c.lower() for k in ["date", "time", "at"]) and not any(k in c.lower() for k in ["name", "cat", "title"])][0]
    df["clean_date"] = df[date_col].astype(str).apply(lambda x: re.findall(r"202\d[0-1]\d[0-3]\d", x)[0] if re.findall(r"202\d[0-1]\d[0-3]\d", x) else "")
    for d in df["clean_date"].unique():
        if len(str(d)) == 8 and str(d).isdigit():
            items = df[df["clean_date"] == d].to_dict(orient="records")
            formatted_d = f"{d[:4]}-{d[4:6]}-{d[6:]}"
            payload = {"date": formatted_d, "items": items, "data": items}
            for fn in [f"history_{d}.json", f"history_{formatted_d}.json"]:
                open(f"history/{fn}", "w", encoding="utf-8").write(json.dumps(payload, ensure_ascii=False))
                open(f"docs/history/{fn}", "w", encoding="utf-8").write(json.dumps(payload, ensure_ascii=False))
print("=== 13개 일자별 백데이터 JSON 완전 동기화 성공 ===")
