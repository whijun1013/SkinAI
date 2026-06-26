import os
import pandas as pd

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))

csv_path = os.path.join(project_root, "en.openbeautyfacts.org.products.csv")

print(f"Loading CSV from {csv_path}...")
df = pd.read_csv(csv_path, sep='\t', low_memory=False)

print(f"Original records: {len(df)}")

# Keep only necessary columns
df = df[['product_name', 'brands', 'ingredients_text']]

# Drop rows where product_name or ingredients_text is missing
df = df.dropna(subset=['product_name', 'ingredients_text'])

# Drop exact duplicates
df = df.drop_duplicates(subset=['product_name', 'brands'])

print(f"Valid records with ingredients: {len(df)}")

output_path = os.path.join(project_root, "apps", "frontend", "public", "cosmetics_db.json")
df.to_json(output_path, orient='records', force_ascii=False)
print(f"Saved to {output_path}")