import json
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(os.path.dirname(os.path.dirname(current_dir)), "apps", "frontend", "public", "cosmetics_db.json")

if not os.path.exists(db_path):
    print(f"Error: {db_path} does not exist!")
    exit(1)

print("Loading existing cosmetics DB...")
with open(db_path, "r", encoding="utf-8") as f:
    db = json.load(f)

print(f"Loaded {len(db)} products.")

# Define K-Beauty highly popular products to inject
kbeauty_products = [
    {
        "brands": "Biotherm Homme",
        "product_name": "Aquapower Lotion",
        "ingredients_text": "Water, Glycerin, Alcohol Denat., Dimethicone, Silica, Phenoxyethanol, Carbomer, Sodium Hydroxide, Chlorphenesin, Dimethiconol, Salicylic Acid, Tocopheryl Acetate, Menthoxypropanediol, Biosaccharide Gum-1, Limonene, Linalool, Citral, Benzyl Salicylate, Benzyl Alcohol, Geraniol, Parfum"
    },
    {
        "brands": "Aestura",
        "product_name": "Atobarrier 365 Cream",
        "ingredients_text": "Water, Glycerin, Butylene Glycol, Butylene Glycol Dicaprylate/Dicaprate, Pentaerythrityl Tetraisostearate, Cyclopentasiloxane, Squalane, Cetyl Ethylhexanoate, Behenyl Alcohol, Stearic Acid, Ceramide PC-104, Cyclohexasiloxane, C14-22 Alcohols, Hydroxypropyl Bislauramide MEA, Palmitic Acid, Arachidyl Alcohol, C12-20 Alkyl Glucoside, Cholesterol, Tocopheryl Acetate, Ethylhexylglycerin, Polyacrylate-13, Tromethamine, Glyceryl Caprylate, Polyisobutene, Arachidyl Glucoside, Disodium EDTA, Polysorbate 20, Sorbitan Isostearate, Glucose, Tocopherol"
    },
    {
        "brands": "Innisfree",
        "product_name": "Green Tea Seed Serum",
        "ingredients_text": "Water, Propanediol, Glycerin, Alcohol Denat., 1,2-Hexanediol, Trehalose, Niacinamide, Betaine, Saccharide Isomerate, Camellia Sinensis Seed Oil, Cetearyl Olivate, Hydrogenated Lecithin, Sorbitan Olivate, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Lactobacillus Ferment Lysate, Butylene Glycol, Saccharomyces Ferment Filtrate, Tromethamine, Panthenol, Dipotassium Glycyrrhizate, Ethylhexylglycerin, Sodium Metaphosphate, Camellia Sinensis Leaf Extract, Adenosine, Hyaluronic Acid, Fragrance, Linalool, Limonene, Sodium Citrate, Citric Acid, Phenoxyethanol, Beta-Glucan"
    },
    {
        "brands": "Round Lab",
        "product_name": "1025 Dokdo Toner",
        "ingredients_text": "Water, Butylene Glycol, Glycerin, Pentylene Glycol, Propanediol, Chondrus Crispus Extract, Saccharum Officinarum (Sugarcane) Extract, Sea Water, 1,2-Hexanediol, Protease, Betaine, Panthenol, Ethylhexylglycerin, Allantoin, Xanthan Gum, Disodium EDTA"
    },
    {
        "brands": "Round Lab",
        "product_name": "Birch Juice Moisturizing Cream",
        "ingredients_text": "Water, Glycerin, Isononyl Isononanoate, Isododecane, 1,2-Hexanediol, Pentylene Glycol, Betula Platyphylla Japonica Juice, Jojoba Esters, Panthenol, Glucose, Hydrogenated Poly(C6-14 Olefin), Butylene Glycol, Caprylic/Capric Triglyceride, Ammonium Acryloyldimethyltaurate/VP Copolymer, Polyglyceryl-3 Methylglucose Distearate, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Tromethamine, Glyceryl Caprylate, Allantoin, Dipotassium Glycyrrhizate, Ethylhexylglycerin, Disodium EDTA, Sodium Hyaluronate"
    },
    {
        "brands": "Dr.G",
        "product_name": "Red Blemish Clear Soothing Cream",
        "ingredients_text": "Water, Centella Asiatica Extract, Dipropylene Glycol, Vinifera (Grape) Fruit Extract, Methylpropanediol, Glycerin, 1,2-Hexanediol, Niacinamide, Erythritol, Panthenol, Silica, Polyglyceryl-3 Methylglucose Distearate, Neopentyl Glycol Diheptanoate, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Tromethamine, Asiaticoside, Madecassic Acid, Asiatic Acid, Centella Asiatica Leaf Extract, Phytosphingosine, Beta-Glucan, Tocopherol, Biosaccharide Gum-1, Ethylhexylglycerin, Disodium EDTA"
    },
    {
        "brands": "Torriden",
        "product_name": "Dive-In Low Molecular Hyaluronic Acid Serum",
        "ingredients_text": "Water, Butylene Glycol, Glycerin, Dipropylene Glycol, 1,2-Hexanediol, Panthenol, Sodium Hyaluronate, Hydrolyzed Hyaluronic Acid, Diethoxyethyl Succinate, Sodium Acetylated Hyaluronate, Sodium Hyaluronate Crosspolymer, Hydrolyzed Sodium Hyaluronate, Allantoin, Trehalose, Betaine, Propanediol, Portulaca Oleracea Extract, Hamamelis Virginiana (Witch Hazel) Extract, Madecassoside, Madecassic Acid, Ceramide NP, Beta-Glucan, Malachite Extract, Cholesterol, Pentylene Glycol, Glyceryl Acrylate/Acrylic Acid Copolymer, PVM/MA Copolymer, Polyglyceryl-10 Laurate, Xanthan Gum, Tromethamine, Carbomer, Ethylhexylglycerin, Scutellaria Baicalensis Root Extract"
    },
    {
        "brands": "Anua",
        "product_name": "Heartleaf 77% Soothing Toner",
        "ingredients_text": "Houttuynia Cordata Extract, Water, 1,2-Hexanediol, Glycerin, Betaine, Centella Asiatica Extract, Vitex Agnus-Castus Extract, Chamomilla Recutita (Matricaria) Flower Extract, Arctium Lappa Root Extract, Phellinus Linteus Extract, Portulaca Oleracea Extract, Vitis Vinifera (Grape) Fruit Extract, Pyrus Malus (Apple) Fruit Extract, Saccharum Officinarum (Sugarcane) Extract, Panthenol, Butylene Glycol, Isopentyldiol, Methylpropanediol, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Tromethamine, Disodium EDTA"
    },
    {
        "brands": "Physiogel",
        "product_name": "DMT Facial Cream",
        "ingredients_text": "Water, Caprylic/Capric Triglyceride, Glycerin, Pentylene Glycol, Cocos Nucifera (Coconut) Oil, Hydrogenated Lecithin, Butyrospermum Parkii (Shea) Butter, Hydroxyethylcellulose, Squalane, Carbomer, Xanthan Gum, Sodium Carbomer, Ceramide NP"
    },
    {
        "brands": "d'Alba",
        "product_name": "White Truffle First Spray Serum",
        "ingredients_text": "Water, Dipropylene Glycol, Neopentyl Glycol Diheptanoate, 1,2-Hexanediol, Niacinamide, Butylene Glycol, Tuber Magnatum Extract, Tocopherol, Helianthus Annuus (Sunflower) Seed Oil, Glyceryl Lactate/Oleate/Linoleate/Palmitate, Persea Gratissima (Avocado) Oil, Glycine Soja (Soybean) Oil, Bixa Orellana Seed Oil, Royal Jelly Extract, Centella Asiatica Extract, Salvia Hispanica Seed Extract, Ocimum Basilicum (Basil) Flower/Leaf/Stem Extract, Avena Sativa (Oat) Kernel Extract, Dipotassium Glycyrrhizate, Adenosine, Disodium EDTA, Fragrance"
    }
]

# Inject only if product not already exists
injected_count = 0
for kprod in kbeauty_products:
    exists = False
    kname_lower = kprod["product_name"].lower().replace(" ", "")
    kbrand_lower = kprod["brands"].lower().replace(" ", "")
    
    for prod in db:
        pname_lower = str(prod.get("product_name", "")).lower().replace(" ", "")
        pbrand_lower = str(prod.get("brands", "")).lower().replace(" ", "")
        if kname_lower in pname_lower and kbrand_lower in pbrand_lower:
            exists = True
            break
            
    if not exists:
        db.append(kprod)
        injected_count += 1

print(f"Successfully injected {injected_count} new popular K-Beauty products.")
print(f"Total product database size is now {len(db)}.")

with open(db_path, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print("DB update complete!")
