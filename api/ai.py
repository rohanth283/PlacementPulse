import os
import re
import json
import time
import random
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Try importing google genai SDK
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
documents: List[Dict[str, Any]] = []

LIGATURE_MAP = {
    "Ɵ": "ti",
    "Ʃ": "tt",
    "Ō": "ft",
    "ƞ": "tf",
    "ﬁ": "fi",
    "ﬂ": "fl",
    "ﬀ": "ff",
    "ﬃ": "ffi"
}

def clean_text_ligatures(text: str) -> str:
    if not text:
        return text
    for lig, rep in LIGATURE_MAP.items():
        text = text.replace(lig, rep)
    text = text.replace("Plaftorm", "Platform")
    text = text.replace("plaftorm", "platform")
    return text

def normalize_company_name(name: str) -> str:
    if not name:
        return "Unknown"
    cleaned = name.strip()
    lower = cleaned.lower()
    
    # Mapping variants
    variants = {
        "amex": "American Express",
        "american express": "American Express",
        "americanexpress": "American Express",
        "sap": "SAP Labs",
        "sap labs": "SAP Labs",
        "wells fargo": "Wells Fargo",
        "wellsfargo": "Wells Fargo",
        "microsoft": "Microsoft",
        "amazon": "Amazon",
        "apple": "Apple",
        "bny mellon": "BNY Mellon",
        "bny": "BNY Mellon",
        "barclays": "Barclays",
        "goldman sachs": "Goldman Sachs",
        "visa": "VISA",
        "fidelity investments": "Fidelity Investments",
        "fidelity": "Fidelity Investments",
        "walmart": "Walmart Global Tech India",
        "walmart labs": "Walmart Global Tech India",
        "walmart global tech india": "Walmart Global Tech India",
        "arcesium": "Arcesium",
        "citicorp": "Citicorp",
        "citi": "Citicorp",
        "netradyne": "Netradyne",
        "temenos": "Temenos",
        "enphase energy": "Enphase Energy",
        "chronus": "Chronus",
        "natwest": "Natwest",
        "micron technology": "Micron Technology",
        "micron": "Micron Technology"
    }
    
    if lower in variants:
        return variants[lower]
        
    return cleaned

def parse_company_from_filename(filename: str) -> str:
    if not filename:
        return "Unknown"
    base = os.path.splitext(os.path.basename(filename))[0]
    lower_base = base.lower()
    
    multi_word_companies = {
        "american_express": "American Express",
        "wells_fargo": "Wells Fargo",
        "sap_labs": "SAP Labs",
        "bny_mellon": "BNY Mellon",
        "goldman_sachs": "Goldman Sachs",
        "fidelity_investments": "Fidelity Investments",
        "walmart_labs": "Walmart Global Tech India",
        "walmart_global_tech_india": "Walmart Global Tech India",
        "enphase_energy": "Enphase Energy",
        "micron_technology": "Micron Technology",
        "dover_india": "Dover India",
        "ramco_systems": "Ramco Systems",
        "athena_health": "Athena Health",
        "bank_of_america": "Bank of America",
        "western_digital": "Western Digital",
        "versa_networks": "Versa Networks",
        "versa": "Versa Networks",
        "arista_networks": "Arista Networks",
        "optum": "Optum",
        "worlder_team": "Worlder Team",
        "nokia_infinera": "Nokia Infinera",
        "oracle_ofss": "Oracle OFSS",
        "randomwalkai": "RandomWalk.ai"
    }
    
    for prefix, normalized_name in multi_word_companies.items():
        if lower_base.startswith(prefix + "_") or lower_base == prefix:
            return normalized_name
            
    parts = base.split("_")
    company = parts[0]
    return normalize_company_name(company)

def load_documents_index():
    global documents
    # Look in api/data/ first, fallback to root
    paths = [
        os.path.join(BASE_DIR, "data", "experience_index.json"),
        os.path.join(BASE_DIR, "experience_index.json"),
        os.path.join(os.path.dirname(BASE_DIR), "experience_index.json")
    ]
    
    index_file = None
    for p in paths:
        if os.path.exists(p):
            index_file = p
            break
            
    if index_file:
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                documents = json.load(f)
            
            # Perform inline migrations
            changed = False
            for doc in documents:
                for field in ["text", "candidate_name", "role", "company"]:
                    if field in doc and doc[field]:
                        cleaned = clean_text_ligatures(doc[field])
                        if cleaned != doc[field]:
                            doc[field] = cleaned
                            changed = True
                            
                if doc.get("company") == "Unknown" and doc.get("source_file"):
                    parsed_co = parse_company_from_filename(doc["source_file"])
                    doc["company"] = parsed_co
                    changed = True
                elif doc.get("company"):
                    normalized = normalize_company_name(doc["company"])
                    if normalized != doc["company"]:
                        doc["company"] = normalized
                        changed = True
            
            if changed:
                try:
                    with open(index_file, "w", encoding="utf-8") as f:
                        json.dump(documents, f, indent=2, ensure_ascii=False)
                except PermissionError:
                    # Ignore write permission errors on read-only serverless filesystems
                    pass
            print(f"Loaded {len(documents)} experiences from {index_file}")
        except Exception as e:
            print(f"Error loading {index_file}: {e}")
    else:
        print("Warning: experience_index.json not found in any path.")

# Load on module import
load_documents_index()

def dot_product(v1: List[float], v2: List[float]) -> float:
    return sum(x * y for x, y in zip(v1, v2))

def magnitude(v: List[float]) -> float:
    return sum(x * x for x in v) ** 0.5

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    m1 = magnitude(v1)
    m2 = magnitude(v2)
    if m1 == 0 or m2 == 0:
        return 0.0
    return dot_product(v1, v2) / (m1 * m2)

def perform_hybrid_search(query: str, company_filter: Optional[str] = None, top_k: int = 5, client: Optional[Any] = None) -> List[Dict[str, Any]]:
    global documents
    if not documents:
        load_documents_index()
        if not documents:
            return []
            
    filtered_docs = documents
    if company_filter and company_filter.strip():
        cf = company_filter.strip().lower()
        filtered_docs = [doc for doc in documents if doc.get("company", "").lower() == cf]
        
    if not filtered_docs:
        return []
        
    query_embedding = None
    if client:
        try:
            res = client.models.embed_content(
                model="gemini-embedding-001",
                contents=query
            )
            if res.embeddings:
                query_embedding = res.embeddings[0].values
        except Exception as e:
            print(f"Error getting query embedding: {e}")
            
    query_words = [w.lower() for w in re.findall(r'\w+', query) if len(w) > 2]
    
    scored_docs = []
    for doc in filtered_docs:
        doc_embedding = doc.get("embedding")
        vector_score = 0.0
        if query_embedding and doc_embedding:
            vector_score = cosine_similarity(query_embedding, doc_embedding)
            
        lexical_score = 0.0
        doc_text_lower = doc.get("text", "").lower()
        if query_words:
            match_count = 0
            for qw in query_words:
                match_count += doc_text_lower.count(qw)
            if match_count > 0:
                lexical_score = 1.0 + (match_count ** 0.5)
            text_words = len(doc_text_lower.split())
            if text_words > 0:
                lexical_score = lexical_score / (text_words ** 0.2)
                
        score = (vector_score * 0.7) + (lexical_score * 0.3)
        scored_docs.append((score, doc))
        
    scored_docs.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored_docs[:top_k]]

def generate_content_with_retry(user_client, model: str, contents: Any, config: Any = None, max_retries: int = 3) -> Any:
    delay = 1.0
    for attempt in range(max_retries):
        try:
            if config is not None:
                return user_client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config
                )
            else:
                return user_client.models.generate_content(
                    model=model,
                    contents=contents
                )
        except Exception as e:
            err_str = str(e).lower()
            is_rate_limit = any(x in err_str for x in ["429", "quota", "exhausted", "limit", "tpm", "rpm"])
            is_overloaded = any(x in err_str for x in ["503", "overloaded", "unavailable", "service unavailable"])
            
            if (is_rate_limit or is_overloaded) and attempt < max_retries - 1:
                sleep_time = delay + random.uniform(0.5, 1.5)
                print(f"[GEMINI RETRY] API call failed (attempt {attempt+1}/{max_retries}). Retrying in {sleep_time:.2f}s... Error: {e}")
                time.sleep(sleep_time)
                delay *= 2
            else:
                raise e
