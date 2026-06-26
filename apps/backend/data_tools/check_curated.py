import sys, json
sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\user\Downloads\food_items_curated.json', encoding='utf-8') as f:
    data = json.load(f)

for keyword in ['마라탕', '부대찌개']:
    found = [d for d in data if keyword in d.get('name', '')]
    print(f'=== {keyword} ({len(found)}건) ===')
    for item in found[:2]:
        nt = item['nutrition']
        sf = item['skin_factors']
        print(f"  name: {item['name']}")
        print(f"  sodium={nt.get('sodium')} fat={nt.get('fat')} sugar={nt.get('sugar')}")
        print(f"  skin_factors: {json.dumps(sf, ensure_ascii=False)}")
        print()

sodium_cnt = sum(1 for d in data if any(f.get('key') == 'high_sodium' for f in (d.get('skin_factors') or [])))
has_sf = sum(1 for d in data if d.get('skin_factors'))
print(f'high_sodium 항목: {sodium_cnt:,}건')
print(f'skin_factors 있는 항목: {has_sf:,}건 / {len(data):,}건')
