import json
import os
from typing import List, Dict, Optional
from datetime import datetime

DATA_FILE = "data/records.json"

def _ensure_data_dir():
    if not os.path.exists("data"):
        os.makedirs("data")
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, "w") as f:
            json.dump([], f)

def get_all_records() -> List[Dict]:
    _ensure_data_dir()
    try:
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def add_record(record: Dict):
    records = get_all_records()
    record["__backendId"] = str(len(records) + 1)  # Simple ID
    record["timestamp"] = record.get("timestamp", datetime.now().isoformat())
    records.append(record)
    with open(DATA_FILE, "w") as f:
        json.dump(records, f, indent=2)
    return record

def delete_record(record_id: str):
    records = get_all_records()
    records = [r for r in records if r.get("__backendId") != record_id]
    with open(DATA_FILE, "w") as f:
        json.dump(records, f, indent=2)

def get_user_records(email: str) -> List[Dict]:
    records = get_all_records()
    return [r for r in records if r.get("email") == email]
