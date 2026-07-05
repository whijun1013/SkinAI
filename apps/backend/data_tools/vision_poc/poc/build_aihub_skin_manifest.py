import csv
import json
import os
from pathlib import Path

# AI Hub Dataset Root
DATASET_ROOT = r"C:\Users\soldesk\Desktop\프로젝트 자료\안면부 피부질환 이미지 합성데이터"
OUTPUT_DIR = Path(__file__).resolve().parent

def build_manifest():
    manifest_data = []
    
    root_path = Path(DATASET_ROOT)
    if not root_path.exists():
        print(f"Error: Dataset root {DATASET_ROOT} not found.")
        return

    splits = ["Validation", "Training"]
    
    for split in splits:
        label_dir = root_path / split / "02.라벨링데이터"
        image_dir = root_path / split / "01.원천데이터"
        
        if not label_dir.exists() or not image_dir.exists():
            continue
            
        for json_path in label_dir.rglob("*.json"):
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    
                if "annotations" in data and len(data["annotations"]) > 0:
                    anno = data["annotations"][0]
                    diagnosis_info = anno.get("diagnosis_info", {})
                    generated_params = anno.get("generated_parameters", {})
                    photograph = anno.get("photograph", {})
                    bbox = anno.get("bbox", {})
                else:
                    diagnosis_info = data.get("diagnosis_info", {})
                    generated_params = data.get("generated_parameters", {})
                    photograph = data.get("photograph", {})
                    bbox = data.get("bbox", {})
                
                diagnosis_name = diagnosis_info.get("diagnosis_name", "")
                onset = diagnosis_info.get("onset", "")
                distribution = diagnosis_info.get("distribution", "")
                bodypart = diagnosis_info.get("bodypart", "")
                symptom = diagnosis_info.get("symptom", "")
                
                gender = generated_params.get("gender", "")
                age_range = generated_params.get("age_range", "")
                race = generated_params.get("race", "")
                
                # Assume view can be parsed from directory or file name
                view = "정면" if "정면" in json_path.parent.name else "측면" if "측면" in json_path.parent.name else ""
                
                # Image path
                file_name = photograph.get("file_path", "")
                if file_name:
                    # e.g., file_name is "건선/정면/H1_500531_P14_L0.png" or just "H1_...png"
                    # We can use the json_path to infer the exact relative path
                    relative_path = json_path.relative_to(label_dir)
                    image_path = image_dir / relative_path.parent / Path(file_name).name
                else:
                    image_path = image_dir / json_path.relative_to(label_dir).with_suffix(".jpg")
                
                identifier = json_path.stem
                
                lesion_area_path = bbox.get("lesion_area", "")
                
                manifest_data.append({
                    "split": split,
                    "image_path": str(image_path),
                    "label_path": str(json_path),
                    "diagnosis_name": diagnosis_name,
                    "view": view,
                    "identifier": identifier,
                    "onset": onset,
                    "distribution": distribution,
                    "bodypart": bodypart,
                    "symptom": symptom,
                    "age_range": age_range,
                    "gender": gender,
                    "race": race,
                    "lesion_area_path": lesion_area_path
                })
            except Exception as e:
                print(f"Failed to process {json_path}: {e}")
                
    if not manifest_data:
        print("No valid manifest entries generated.")
        return
        
    csv_path = OUTPUT_DIR / "aihub_skin_manifest.csv"
    jsonl_path = OUTPUT_DIR / "aihub_skin_manifest.jsonl"
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=manifest_data[0].keys())
        writer.writeheader()
        writer.writerows(manifest_data)
        
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for entry in manifest_data:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            
    print(f"Successfully created manifest with {len(manifest_data)} entries.")

if __name__ == "__main__":
    build_manifest()
