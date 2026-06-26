import sys, json
sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\user\Downloads\food_items_curated.json', encoding='utf-8') as f:
    data = json.load(f)

no_sf = [d for d in data if not d.get('skin_factors')]
print(f'skin_factors 없는 항목: {len(no_sf):,}건 / {len(data):,}건')
print()

# 카테고리별 분포
from collections import Counter
cat_counter = Counter(d.get('category', '없음') for d in no_sf)
print('[카테고리별 상위 15개]')
for cat, cnt in cat_counter.most_common(15):
    print(f'  {cat}: {cnt:,}건')

print()

# 샘플 음식명 50개
print('[음식명 샘플 50개]')
for d in no_sf[:50]:
    nt = d.get('nutrition') or {}
    print(f"  {d['name']} | 나트륨={nt.get('sodium')} 지방={nt.get('fat')} 당류={nt.get('sugar')}")
