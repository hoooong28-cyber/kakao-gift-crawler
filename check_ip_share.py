import json
import os

# 마스터 DB 우선, 없으면 docs/data.json
data_file = 'data/products_master.json'
if not os.path.exists(data_file):
    data_file = 'docs/data.json'

with open(data_file, 'r', encoding='utf-8') as f:
    products = json.load(f)

print(f"[데이터 파일] {data_file}")
print(f"[총 상품 수] {len(products)}")
print()

# character_ip 분포 집계
ip_counts = {}
for p in products:
    ip = p.get('character_ip', '없음')
    if not ip:
        ip = '(비어있음)'
    ip_counts[ip] = ip_counts.get(ip, 0) + 1

print("=== 전체 character_ip 분포 ===")
for k, v in sorted(ip_counts.items(), key=lambda x: -x[1]):
    pct = v / len(products) * 100
    print(f"  {k}: {v}개 ({pct:.1f}%)")

print()
# 망그러진 곰 관련 상품 찾기
print("=== '망그러진' or '망곰' 포함 상품 샘플 ===")
for p in products:
    name = p.get('name', '')
    ip = p.get('character_ip', '')
    if '망그러진' in name or '망곰' in name:
        print(f"  [{ip}] {name[:60]}")
