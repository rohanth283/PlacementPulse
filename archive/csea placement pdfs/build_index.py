#!/usr/bin/env python3
import os
import re
import sys
import json
import time
import random
import argparse
from typing import List, Dict, Any, Optional

# Load API Key from .env
def load_api_key() -> Optional[str]:
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ.get("GEMINI_API_KEY")
    
    env_paths = [".env", "../.env"]
    for path in env_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY="):
                            parts = line.split("=", 1)
                            if len(parts) > 1:
                                val = parts[1].strip()
                                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                                    val = val[1:-1]
                                return val
            except Exception:
                pass
    return None

# Load google-genai client
try:
    from google import genai
except ImportError:
    print("[ERROR] google-genai is not installed. Please run: pip install google-genai")
    sys.exit(1)

def extract_metadata_heuristics(filename: str, content: str) -> Dict[str, Any]:
    """Helper to extract basic metadata from filename and text using heuristics."""
    # 1. Parse filename (Format: Candidate Name-Company.txt)
    base = os.path.splitext(filename)[0]
    parts = base.split("-", 1)
    
    candidate_name = parts[0].strip()
    company_name = parts[1].strip() if len(parts) > 1 else "Unknown"
    
    company_name = re.sub(r'\s+', ' ', company_name).strip()
    
    # 2. Extract Package (e.g. 25.5 LPA, 18 Lakhs)
    package_match = re.search(r'\b(\d+(?:\.\d+)?)\s*(LPA|Lakhs|Lakh|L\.P\.A\.)\b', content, re.IGNORECASE)
    package = f"{package_match.group(1)} {package_match.group(2)}" if package_match else None
    
    # 3. Extract Role (e.g. SDE, Software Engineer, Analyst, Intern)
    role = None
    role_keywords = ["Software Development Engineer", "SDE", "Software Engineer", "Analyst", "Associate SDE", "Systems Engineer", "Developer", "Intern", "Graduate Engineer Trainee", "GET"]
    for kw in role_keywords:
        if re.search(rf'\b{re.escape(kw)}\b', content, re.IGNORECASE):
            role = kw
            break
            
    # 4. Infer Difficulty
    difficulty = "Medium"
    if re.search(r'\b(grilling|very tough|extremely hard|hardest|brutal)\b', content, re.IGNORECASE):
        difficulty = "Hard"
    elif re.search(r'\b(very easy|cakewalk|smooth|relaxed|basic)\b', content, re.IGNORECASE):
        difficulty = "Easy"
        
    # 5. Extract Year (Look for 2022 to 2026 in filename or content, default to 2025)
    year_match = re.search(r'\b(202[2-6])\b', filename)
    if not year_match:
        year_match = re.search(r'\b(202[2-6])\b', content)
    year = year_match.group(1) if year_match else "2025"
    
    # 6. Extract Role Type (Placement vs Internship)
    role_type = "Placement"
    if "intern" in filename.lower() or "intern" in content.lower() or (role and "intern" in role.lower()):
        role_type = "Internship"
        
    return {
        "candidate_name": candidate_name,
        "company": company_name,
        "package": package,
        "role": role or "Software Engineer",
        "difficulty": difficulty,
        "year": year,
        "role_type": role_type
    }

def embed_texts_with_retry(client: genai.Client, texts: List[str], max_retries: int = 5) -> List[List[float]]:
    """Get embeddings for a list of texts using Gemini's gemini-embedding-001 model with backoff."""
    delay = 10.0  # Increased initial delay for safer rate limit handling
    for attempt in range(max_retries):
        try:
            response = client.models.embed_content(
                model="gemini-embedding-001",
                contents=texts
            )
            embeddings = response.embeddings
            return [emb.values for emb in embeddings]
        except Exception as e:
            err_str = str(e).lower()
            if attempt == max_retries - 1:
                print(f"[CRITICAL ERROR] Failed to embed texts after {max_retries} attempts: {e}")
                raise e
            
            is_rate_limit = "429" in err_str or "quota" in err_str or "rate" in err_str or "limit" in err_str or "exhausted" in err_str
            is_unavailable = "503" in err_str or "overloaded" in err_str or "unavailable" in err_str
            
            if is_rate_limit:
                sleep_time = delay + random.uniform(15.0, 25.0)  # Sleep significantly longer on rate limits
                print(f"\n[EMBED RATE LIMIT] Rate limit hit. Sleeping for {sleep_time:.1f}s (Attempt {attempt+1}/{max_retries})...")
                time.sleep(sleep_time)
                delay *= 2
            elif is_unavailable:
                sleep_time = 8.0 + random.uniform(2.0, 5.0)
                print(f"\n[EMBED OVERLOAD] Gemini overloaded (503). Retrying in {sleep_time:.1f}s (Attempt {attempt+1}/{max_retries})...")
                time.sleep(sleep_time)
            else:
                sleep_time = 5.0 + random.uniform(2.0, 4.0)
                print(f"\n[EMBED ERROR] Transient error: {e}. Retrying in {sleep_time:.1f}s (Attempt {attempt+1}/{max_retries})...")
                time.sleep(sleep_time)
    return []

def main():
    parser = argparse.ArgumentParser(description="Build database index from candidate experiences.")
    parser.add_argument("--no-embeddings", action="store_true", help="Skip generating vector embeddings to avoid API rate limits.")
    parser.add_argument("--batch-size", type=int, default=10, help="Batch size for embedding generation (smaller is safer for free keys).")
    parser.add_argument("--delay", type=float, default=6.0, help="Delay in seconds between embedding requests.")
    args = parser.parse_args()

    text_dir = "text"
    if not os.path.exists(text_dir) and os.path.exists("../text"):
        text_dir = "../text"
        
    if not os.path.exists(text_dir):
        print(f"[ERROR] text directory not found at {text_dir}.")
        sys.exit(1)
        
    file_entries = []
    for dept in ["cse", "it"]:
        dept_dir = os.path.join(text_dir, dept)
        if os.path.exists(dept_dir):
            for f in os.listdir(dept_dir):
                if f.endswith(".txt"):
                    file_entries.append({
                        "filename": f,
                        "filepath": os.path.join(dept_dir, f),
                        "department": dept.upper() # "CSE" or "IT"
                    })
        else:
            print(f"[WARNING] Subdirectory {dept} not found in {text_dir}.")

    if not file_entries:
        print("[WARNING] No files found in cse/it subdirectories. Scanning root text folder as CSE...")
        for f in os.listdir(text_dir):
            if f.endswith(".txt"):
                file_entries.append({
                    "filename": f,
                    "filepath": os.path.join(text_dir, f),
                    "department": "CSE"
                })

    file_entries.sort(key=lambda x: x["filename"])
    
    print(f"Found {len(file_entries)} text files to index.")
    
    documents = []
    for idx, entry in enumerate(file_entries, 1):
        filename = entry["filename"]
        filepath = entry["filepath"]
        dept = entry["department"]
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read().strip()
                if not content:
                    continue
                
                meta = extract_metadata_heuristics(filename, content)
                documents.append({
                    "id": idx,
                    "source_file": filename,
                    "candidate_name": meta["candidate_name"],
                    "company": meta["company"],
                    "package": meta["package"],
                    "role": meta["role"],
                    "difficulty": meta["difficulty"],
                    "year": meta["year"],
                    "role_type": meta["role_type"],
                    "department": dept,
                    "text": content,
                    "embedding": None
                })
        except Exception as e:
            print(f"[ERROR] Failed to read {filename}: {e}")
            
    total_docs = len(documents)
    print(f"Loaded {total_docs} documents.")
    
    if args.no_embeddings:
        print("[INFO] --no-embeddings set. Skipping API calls. Saving offline index immediately...")
    else:
        api_key = load_api_key()
        if not api_key:
            print("[WARNING] GEMINI_API_KEY not found in env or .env file. Falling back to offline-only index...")
            args.no_embeddings = True
        else:
            client = genai.Client(api_key=api_key)
            print(f"Generating vector embeddings using gemini-embedding-001 (batch size: {args.batch_size}, delay: {args.delay}s)...")
            
            # Batch embedding generation
            batch_size = args.batch_size
            batches = [documents[i:i + batch_size] for i in range(0, total_docs, batch_size)]
            total_batches = len(batches)
            
            start_time = time.time()
            
            for b_idx, batch in enumerate(batches, 1):
                print(f"Processing embedding batch {b_idx}/{total_batches} ({len(batch)} items)...")
                texts_to_embed = [doc["text"] for doc in batch]
                
                try:
                    embeddings = embed_texts_with_retry(client, texts_to_embed)
                    for doc, emb in zip(batch, embeddings):
                        doc["embedding"] = emb
                    print(f"Successfully embedded batch {b_idx}.")
                except Exception as e:
                    print(f"\n[ERROR] Embedding failed for batch {b_idx}: {e}")
                    print("[RECOVER] Saving documents processed so far, remaining documents will not have embeddings.")
                    break
                    
                # Delay between batches
                if b_idx < total_batches:
                    time.sleep(args.delay)
            
            duration = time.time() - start_time
            print(f"\nEmbedding generation completed in {duration:.1f} seconds.")

    # Save the index to experience_index.json
    output_file = "experience_index.json"
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(documents, f, indent=2, ensure_ascii=False)
        print(f"\n[SUCCESS] Indexed {total_docs} experiences!")
        print(f"Index database saved to: {output_file}")
    except Exception as e:
        print(f"[ERROR] Failed to save index: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
