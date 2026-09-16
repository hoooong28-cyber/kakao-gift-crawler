import os, glob, json, re
os.makedirs('history', exist_ok=True)
os.makedirs('docs/history', exist_ok=True)
files = glob.glob('**/*', recursive=True)
dates = set()
for f in files:
    for d in re.findall(r'202\d[0-1]\d[0-3]\d', f):
        dates.add(d)
dates_list = sorted(list(dates), reverse=True)
formatted = [f'{d[:4]}-{d[4:6]}-{d[6:]}' for d in dates_list if len(d)==8]
payload = {'dates': formatted, 'history': formatted, 'raw_dates': dates_list}
for p in ['dates.json', 'history_list.json', 'docs/dates.json', 'docs/history_list.json']:
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
print('=== 복원 완료된 전체 일자 ===')
print(formatted)
