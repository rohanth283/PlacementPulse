import os
import re
import json
import secrets
import hashlib
import psycopg2
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Header, Depends, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables on startup
load_dotenv()

# Initialize FastAPI App
app = FastAPI(title="Placement Experience Chatbot")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------
# Database Management (Postgres - Neon)
# ----------------------------------------------------
DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set. Please specify it in .env.")
    return psycopg2.connect(DATABASE_URL)

def init_db():
    if not DATABASE_URL:
        print("[WARNING] DATABASE_URL is not set. Database initialization skipped.")
        return
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Users table (SERIAL PRIMARY KEY for Postgres)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL
            )
        """)
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;")
        
        # Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token VARCHAR(255) PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at VARCHAR(100) NOT NULL
            )
        """)
        
        # Conversations table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id VARCHAR(255) PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                company_filter VARCHAR(255),
                created_at VARCHAR(100) NOT NULL
            )
        """)
        cursor.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;")
        
        # Messages table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role VARCHAR(50) NOT NULL,
                text TEXT NOT NULL,
                citations TEXT,
                created_at VARCHAR(100) NOT NULL
            )
        """)
        
        # Request logs table for rate limiting
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS request_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                endpoint VARCHAR(100) NOT NULL,
                created_at TIMESTAMP NOT NULL
            )
        """)
        
        # Token usage table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS token_usage (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                prompt_tokens INTEGER DEFAULT 0,
                completion_tokens INTEGER DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                model VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Seed default admin if none exists
        cursor.execute("SELECT id FROM users WHERE is_admin = TRUE LIMIT 1")
        if not cursor.fetchone():
            # Check if there is already an 'admin' user who is not marked admin
            admin_hash = hash_password("admin123")
            cursor.execute("SELECT id FROM users WHERE username = 'admin'")
            if cursor.fetchone():
                cursor.execute("UPDATE users SET is_admin = TRUE, password_hash = %s WHERE username = 'admin'", (admin_hash,))
            else:
                cursor.execute("INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', %s, TRUE)", (admin_hash,))
            print("[SEED] Default admin seeded successfully: admin / admin123")
            
        conn.commit()
        cursor.close()
        conn.close()
        print("[SUCCESS] Neon Postgres database initialized successfully.")
    except Exception as e:
        print(f"[FATAL] Failed to initialize Neon Postgres database: {e}")

# Run database setup
init_db()

# Password hashing helper
def hash_password(password: str) -> str:
    salt = b"placement_pulse_salt_1234"
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return hash_bytes.hex()

# Authentication dependency
def get_current_user_id(authorization: Optional[str] = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: Missing or invalid token format.")
    
    token = authorization.split(" ")[1]
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id, expires_at FROM sessions WHERE token = %s", (token,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid session token.")
        
    user_id, expires_at_str = row
    
    expires_at = datetime.fromisoformat(expires_at_str)
    if expires_at < datetime.utcnow():
        # Clear expired session
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE token = %s", (token,))
        conn.commit()
        cursor.close()
        conn.close()
        raise HTTPException(status_code=401, detail="Unauthorized: Session expired.")
        
    return user_id

def check_rate_limit(user_id: int, endpoint: str):
    """Enforces rate limits (5 requests/minute and 50 requests/day per user)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = datetime.utcnow()
    one_minute_ago = now - timedelta(minutes=1)
    one_day_ago = now - timedelta(days=1)
    
    try:
        # 1. Short-term limit: 5 requests per minute
        cursor.execute("""
            SELECT COUNT(*) FROM request_logs
            WHERE user_id = %s AND endpoint = %s AND created_at >= %s
        """, (user_id, endpoint, one_minute_ago))
        reqs_last_min = cursor.fetchone()[0]
        
        if reqs_last_min >= 5:
            raise HTTPException(
                status_code=429,
                detail="Too Many Requests: Rate limit exceeded. Max 5 chat queries per minute."
            )
            
        # 2. Long-term limit: 50 requests per 24 hours
        cursor.execute("""
            SELECT COUNT(*) FROM request_logs
            WHERE user_id = %s AND endpoint = %s AND created_at >= %s
        """, (user_id, endpoint, one_day_ago))
        reqs_last_day = cursor.fetchone()[0]
        
        if reqs_last_day >= 50:
            raise HTTPException(
                status_code=429,
                detail="Daily limit exceeded: Max 50 chat queries per 24 hours."
            )
            
        # 3. Log current request
        cursor.execute("""
            INSERT INTO request_logs (user_id, endpoint, created_at)
            VALUES (%s, %s, %s)
        """, (user_id, endpoint, now))
        conn.commit()
        
    finally:
        cursor.close()
        conn.close()

# ----------------------------------------------------
# Gemini Client & Document Loading
# ----------------------------------------------------
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

# Get API key from env loaded by dotenv
gemini_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=gemini_key) if (genai and gemini_key) else None

# Load documents index
documents: List[Dict[str, Any]] = []
def load_documents_index():
    global documents
    index_file = "experience_index.json"
    if os.path.exists(index_file):
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                documents = json.load(f)
            print(f"Loaded {len(documents)} experiences from {index_file}")
        except Exception as e:
            print(f"Error loading {index_file}: {e}")
    else:
        print(f"Warning: {index_file} not found. Please build it first.")

load_documents_index()

# ----------------------------------------------------
# Vector Search & RAG Helpers
# ----------------------------------------------------
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

def perform_hybrid_search(query: str, company_filter: Optional[str] = None, top_k: int = 5) -> List[Dict[str, Any]]:
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
                lexical_score = lexical_score / (text_words ** 0.1)
                
        metadata_boost = 0.0
        doc_company = doc.get("company", "").lower()
        doc_candidate = doc.get("candidate_name", "").lower()
        
        for qw in query_words:
            if qw in doc_company:
                metadata_boost += 5.0
            if qw in doc_candidate:
                metadata_boost += 3.0
                
        if doc_embedding:
            norm_lexical = min(lexical_score / 2.0, 1.0)
            hybrid_score = (0.7 * vector_score) + (0.3 * norm_lexical) + (metadata_boost * 0.1)
        else:
            hybrid_score = lexical_score + metadata_boost
            
        doc_copy = {k: v for k, v in doc.items() if k != "embedding"}
        doc_copy["score"] = hybrid_score
        scored_docs.append(doc_copy)
        
    scored_docs.sort(key=lambda x: x["score"], reverse=True)
    return scored_docs[:top_k]

# ----------------------------------------------------
# API Request / Response Schemas
# ----------------------------------------------------
class AuthRequest(BaseModel):
    username: str
    password: str

class CreateConvRequest(BaseModel):
    title: Optional[str] = "New Chat"
    company_filter: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    conversation_id: str
    company_filter: Optional[str] = None

class UpdateTitleRequest(BaseModel):
    title: str

class ReorderRequest(BaseModel):
    order: List[str]

# ----------------------------------------------------
# Static Assets serving
# ----------------------------------------------------
@app.get("/")
def get_index():
    return FileResponse("index.html")

@app.get("/admin")
def get_admin_page():
    return FileResponse("admin.html")

@app.get("/style.css")
def get_css():
    return FileResponse("style.css")

@app.get("/app.js")
def get_js():
    return FileResponse("app.js")

@app.get("/favicon.svg")
def get_favicon_svg():
    return FileResponse("favicon.svg")

@app.get("/favicon.ico")
def get_favicon_ico():
    return FileResponse("favicon.svg")

# ----------------------------------------------------
# Authentication Routes
# ----------------------------------------------------
@app.post("/api/auth/signup")
def signup(payload: AuthRequest):
    username = payload.username.strip()
    password = payload.password.strip()
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password cannot be empty.")
        
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check user existence (%s for Postgres)
    cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
    if cursor.fetchone():
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Username is already taken.")
        
    # Create user
    pw_hash = hash_password(password)
    try:
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s)", (username, pw_hash))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Signup failed: {str(e)}")
    finally:
        cursor.close()
        conn.close()
        
    return JSONResponse(content={"success": True, "message": "User registered successfully."})

@app.post("/api/auth/login")
def login(payload: AuthRequest):
    username = payload.username.strip()
    password = payload.password.strip()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, password_hash FROM users WHERE username = %s", (username,))
    row = cursor.fetchone()
    
    if not row:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid username or password.")
        
    user_id, pw_hash = row
    if hash_password(password) != pw_hash:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid username or password.")
        
    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(days=7)
    expires_at_str = expires_at.isoformat()
    
    try:
        cursor.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (%s, %s, %s)", (token, user_id, expires_at_str))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Login session creation failed: {str(e)}")
    finally:
        cursor.close()
        conn.close()
    
    return JSONResponse(content={"token": token, "username": username})

@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return JSONResponse(content={"success": True})
        
    token = authorization.split(" ")[1]
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE token = %s", (token,))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Logout failed: {e}")
        
    return JSONResponse(content={"success": True})

@app.get("/api/auth/me")
def get_me(user_id: int = Depends(get_current_user_id)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT username, is_admin FROM users WHERE id = %s", (user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
        
    return JSONResponse(content={"username": row[0], "is_admin": row[1]})

# Admin verification helper
def verify_admin(user_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_admin FROM users WHERE id = %s", (user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if not row or not row[0]:
        raise HTTPException(status_code=403, detail="Forbidden: Admin credentials required.")

# Admin stats API
@app.get("/api/admin/stats")
def get_admin_stats(user_id: int = Depends(get_current_user_id)):
    verify_admin(user_id)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # 1. Total Registered Users
        cursor.execute("SELECT COUNT(*) FROM users")
        total_users = cursor.fetchone()[0]
        
        # 2. Total Conversations
        cursor.execute("SELECT COUNT(*) FROM conversations")
        total_convs = cursor.fetchone()[0]
        
        # 3. Total Messages
        cursor.execute("SELECT COUNT(*) FROM messages")
        total_messages = cursor.fetchone()[0]
        
        # 4. Total Tokens used
        cursor.execute("SELECT COALESCE(SUM(prompt_tokens), 0), COALESCE(SUM(completion_tokens), 0), COALESCE(SUM(total_tokens), 0) FROM token_usage")
        prompt_t, comp_t, total_t = cursor.fetchone()
        
        # 5. Users List with aggregate details
        cursor.execute("""
            SELECT u.id, u.username, u.is_admin,
                   (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) as chat_count,
                   (SELECT COUNT(*) FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.user_id = u.id) as message_count,
                   COALESCE((SELECT SUM(total_tokens) FROM token_usage WHERE user_id = u.id), 0) as token_count
            FROM users u
            ORDER BY u.id ASC
        """)
        users_list = []
        for r in cursor.fetchall():
            users_list.append({
                "id": r[0],
                "username": r[1],
                "is_admin": r[2],
                "chat_count": r[3],
                "message_count": r[4],
                "token_count": r[5]
            })
            
        return JSONResponse(content={
            "stats": {
                "total_users": total_users,
                "total_conversations": total_convs,
                "total_messages": total_messages,
                "prompt_tokens": prompt_t,
                "completion_tokens": comp_t,
                "total_tokens": total_t
            },
            "users": users_list
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch admin stats: {str(e)}")
    finally:
        cursor.close()
        conn.close()

# ----------------------------------------------------
# Conversation Management Routes
# ----------------------------------------------------
@app.get("/api/conversations")
def get_conversations(user_id: int = Depends(get_current_user_id)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, company_filter, created_at 
        FROM conversations 
        WHERE user_id = %s 
        ORDER BY display_order ASC, created_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    
    convs = []
    for r in rows:
        convs.append({
            "id": r[0],
            "title": r[1],
            "company_filter": r[2],
            "created_at": r[3]
        })
    return JSONResponse(content={"conversations": convs})

@app.post("/api/conversations")
def create_conversation(payload: CreateConvRequest, user_id: int = Depends(get_current_user_id)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    conv_id = str(secrets.token_urlsafe(16))
    title = payload.title.strip() if payload.title else "New Chat"
    created_at_str = datetime.utcnow().isoformat()
    
    try:
        cursor.execute("""
            INSERT INTO conversations (id, user_id, title, company_filter, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (conv_id, user_id, title, payload.company_filter, created_at_str))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create conversation: {str(e)}")
    finally:
        cursor.close()
        conn.close()
    
    return JSONResponse(content={
        "id": conv_id,
        "title": title,
        "company_filter": payload.company_filter,
        "created_at": created_at_str
    })

@app.delete("/api/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, user_id: int = Depends(get_current_user_id)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM conversations WHERE id = %s AND user_id = %s", (conversation_id, user_id))
    if not cursor.fetchone():
        cursor.close()
        conn.close()
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this chat.")
        
    try:
        cursor.execute("DELETE FROM conversations WHERE id = %s", (conversation_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete conversation: {str(e)}")
    finally:
        cursor.close()
        conn.close()
    
    return JSONResponse(content={"success": True})

@app.put("/api/conversations/{conversation_id}/title")
def update_conversation_title(conversation_id: str, payload: UpdateTitleRequest, user_id: int = Depends(get_current_user_id)):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty.")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify ownership
    cursor.execute("SELECT id FROM conversations WHERE id = %s AND user_id = %s", (conversation_id, user_id))
    if not cursor.fetchone():
        cursor.close()
        conn.close()
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this chat session.")
        
    try:
        cursor.execute("UPDATE conversations SET title = %s WHERE id = %s", (title, conversation_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update title: {str(e)}")
    finally:
        cursor.close()
        conn.close()
        
    return JSONResponse(content={"success": True, "title": title})

@app.put("/api/conversations/reorder")
def reorder_conversations(payload: ReorderRequest, user_id: int = Depends(get_current_user_id)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        for idx, conv_id in enumerate(payload.order):
            cursor.execute(
                "UPDATE conversations SET display_order = %s WHERE id = %s AND user_id = %s",
                (idx, conv_id, user_id)
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        cursor.close()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Reordering failed: {str(e)}")
    finally:
        cursor.close()
        conn.close()
    return JSONResponse(content={"success": True})

@app.get("/api/conversations/{conversation_id}/messages")
def get_messages(conversation_id: str, user_id: int = Depends(get_current_user_id)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM conversations WHERE id = %s AND user_id = %s", (conversation_id, user_id))
    if not cursor.fetchone():
        cursor.close()
        conn.close()
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this chat.")
        
    cursor.execute("""
        SELECT role, text, citations, created_at 
        FROM messages 
        WHERE conversation_id = %s 
        ORDER BY id ASC
    """, (conversation_id,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    
    msgs = []
    for r in rows:
        citations = []
        if r[2]:
            try:
                citations = json.loads(r[2])
            except Exception:
                pass
        msgs.append({
            "role": r[0],
            "text": r[1],
            "citations": citations,
            "created_at": r[3]
        })
    return JSONResponse(content={"messages": msgs})

# ----------------------------------------------------
# Placement Explorer Details (Public but checks auth)
# ----------------------------------------------------
@app.get("/api/companies")
def get_companies(user_id: int = Depends(get_current_user_id)):
    global documents
    if not documents:
        load_documents_index()
    companies = sorted(list(set(doc.get("company", "Unknown") for doc in documents if doc.get("company"))))
    return JSONResponse(content={"companies": companies})

@app.get("/api/experiences")
def get_experiences(
    company: Optional[str] = None, 
    q: Optional[str] = None, 
    year: Optional[str] = None,
    role_type: Optional[str] = None,
    department: Optional[str] = None,
    user_id: int = Depends(get_current_user_id)
):
    global documents
    if not documents:
        load_documents_index()
        
    results = documents
    if company:
        results = [doc for doc in results if doc.get("company", "").lower() == company.lower()]
    if year:
        results = [doc for doc in results if str(doc.get("year", "")) == str(year)]
    if role_type:
        results = [doc for doc in results if doc.get("role_type", "").lower() == role_type.lower()]
    if department:
        results = [doc for doc in results if doc.get("department", "").lower() == department.lower()]
    if q:
        q_lower = q.lower()
        results = [doc for doc in results if q_lower in doc.get("text", "").lower() or q_lower in doc.get("candidate_name", "").lower()]
        
    meta_results = []
    for doc in results:
        meta_results.append({
            "id": doc.get("id"),
            "source_file": doc.get("source_file"),
            "candidate_name": doc.get("candidate_name"),
            "company": doc.get("company"),
            "package": doc.get("package"),
            "role": doc.get("role"),
            "difficulty": doc.get("difficulty"),
            "year": doc.get("year", "2025"),
            "role_type": doc.get("role_type", "Placement"),
            "department": doc.get("department", "CSE"),
            "text_length": len(doc.get("text", ""))
        })
    return JSONResponse(content={"experiences": meta_results})

@app.get("/api/experience/{doc_id}")
def get_experience_by_id(doc_id: int, user_id: int = Depends(get_current_user_id)):
    global documents
    if not documents:
        load_documents_index()
    for doc in documents:
        if doc.get("id") == doc_id:
            return JSONResponse(content={k: v for k, v in doc.items() if k != "embedding"})
    raise HTTPException(status_code=404, detail="Experience not found")

# ----------------------------------------------------
# Chat Completion with DB saving and Auto-naming
# ----------------------------------------------------
@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest, user_id: int = Depends(get_current_user_id)):
    if not client:
        raise HTTPException(status_code=500, detail="Gemini client not initialized. Check GEMINI_API_KEY.")
        
    # Enforce rate limit
    check_rate_limit(user_id, "/api/chat")
    
    # 1. Alphanumeric query validation
    clean_msg = payload.message.strip()
    if not re.search(r'[a-zA-Z0-9]', clean_msg):
        raise HTTPException(
            status_code=400, 
            detail="Invalid Query: Please enter a query containing alphanumeric characters. Special characters and emojis alone are not supported."
        )
        
    conv_id = payload.conversation_id
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT title, company_filter FROM conversations WHERE id = %s AND user_id = %s", (conv_id, user_id))
    conv_row = cursor.fetchone()
    if not conv_row:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this chat session.")
        
    conv_title, company_filter = conv_row
    
    # 2. Synchronize company filter state
    if payload.company_filter is not None:
        cf = payload.company_filter.strip()
        if cf == "":
            cf = None
        if cf != company_filter:
            cursor.execute("UPDATE conversations SET company_filter = %s WHERE id = %s", (cf, conv_id))
            conn.commit()
            company_filter = cf
            
    created_at_str = datetime.utcnow().isoformat()
    try:
        cursor.execute("""
            INSERT INTO messages (conversation_id, role, text, created_at)
            VALUES (%s, %s, %s, %s)
        """, (conv_id, "user", payload.message, created_at_str))
        conn.commit()
    except Exception as e:
        conn.rollback()
        cursor.close()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to save message: {str(e)}")
        
    cursor.execute("SELECT COUNT(*) FROM messages WHERE conversation_id = %s AND role = 'user'", (conv_id,))
    msg_count = cursor.fetchone()[0]
    
    new_title = None
    if msg_count == 1:
        naming_prompt = f"""Based on this first query in a placement experience chat: "{payload.message}", generate a short, clean, professional conversation title in 3-4 words (e.g. "Amazon SDE Prep", "DBMS Overviews", "Wells Fargo Tips").
Return ONLY the title. Do not include quote marks, punctuation, prefixes, or comments.
"""
        try:
            name_res = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=naming_prompt
            )
            if name_res and name_res.text:
                new_title = name_res.text.strip().replace('"', '').replace("'", "")
                new_title = new_title[:40]
                cursor.execute("UPDATE conversations SET title = %s WHERE id = %s", (new_title, conv_id))
                conn.commit()
        except Exception as e:
            print(f"Error auto-naming chat: {e}")
            
    cursor.execute("SELECT role, text FROM messages WHERE conversation_id = %s ORDER BY id ASC", (conv_id,))
    history_rows = cursor.fetchall()
    
    retrieved_docs = perform_hybrid_search(payload.message, company_filter, top_k=6)
    
    if not retrieved_docs:
        context_str = "No specific placement experiences match this query in the database."
    else:
        context_blocks = []
        for doc in retrieved_docs:
            block = f"SOURCE FILE: {doc['source_file']}\n"
            block += f"CANDIDATE: {doc['candidate_name']}\n"
            block += f"DEPARTMENT: {doc.get('department', 'CSE')}\n"
            block += f"COMPANY: {doc['company']}\n"
            block += f"ROLE: {doc['role']}\n"
            block += f"PACKAGE: {doc['package'] or 'Not Specified'}\n"
            block += f"DIFFICULTY: {doc['difficulty']}\n"
            # 3. Truncate each document content to first 4,000 characters to prevent TPM limits
            block += f"INTERVIEW DETAILS:\n{doc['text'][:4000]}...\n"
            context_blocks.append(block)
        context_str = "\n\n==================================================\n\n".join(context_blocks)
        
    system_instruction = """You are PlacementPulse, a premium technical interview advisor. You have access to real placement experiences of students.
Your job is to answer the user's question accurately using ONLY the provided candidate placement experiences in the CONTEXT.

Strict Guidelines:
1. Base your answer solely on the provided candidate experiences in the CONTEXT. Do not speculate or assume details.
2. Cite your sources clearly when discussing experiences. Use format: "According to [Candidate Name] ([Company Name])..." or "In [Candidate Name]'s interview at [Company Name]...".
3. If the context does not contain relevant details to answer the query, say: "I couldn't find details about this in the student placement experiences." Then provide alternative suggested queries or recovery options (e.g., "Try asking: 'What coding questions did Amazon ask?' or 'Give me tips for Wells Fargo'").
4. Format your answer with clean Markdown: use subheadings, bold text, bullet points, and code blocks for programming solutions. Keep it extremely readable and professional.
"""

    contents = []
    # Truncate conversation history messages if they are too long
    for h_role, h_text in history_rows[:-1]:
        api_role = "user" if h_role == "user" else "model"
        contents.append(types.Content(
            role=api_role,
            parts=[types.Part.from_text(text=h_text[:3000])]
        ))
        
    enriched_prompt = f"""CONTEXT OF STUDENT EXPERIENCES:
==================================================
{context_str}
==================================================

USER QUESTION:
{payload.message[:2000]}
"""
    contents.append(types.Content(
        role="user",
        parts=[types.Part.from_text(text=enriched_prompt)]
    ))
    
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=0.2
    )
    
    try:
        # Call Gemini 2.5 Flash
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=config
        )
        
        citations = []
        for doc in retrieved_docs:
            citations.append({
                "id": doc["id"],
                "candidate_name": doc["candidate_name"],
                "company": doc["company"],
                "role": doc["role"],
                "score": round(doc["score"], 3)
            })
            
        citations_json = json.dumps(citations)
        created_at_str = datetime.utcnow().isoformat()
        
        # Save model response message first and commit transaction
        cursor.execute("""
            INSERT INTO messages (conversation_id, role, text, citations, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (conv_id, "model", response.text, citations_json, created_at_str))
        conn.commit()
        
        # Log token usage in a completely separate database transaction block
        if response and hasattr(response, "usage_metadata") and response.usage_metadata:
            try:
                p_tokens = response.usage_metadata.prompt_token_count or 0
                c_tokens = response.usage_metadata.candidates_token_count or 0
                t_tokens = response.usage_metadata.total_token_count or 0
                
                cursor.execute("""
                    INSERT INTO token_usage (user_id, prompt_tokens, completion_tokens, total_tokens, model)
                    VALUES (%s, %s, %s, %s, %s)
                """, (user_id, p_tokens, c_tokens, t_tokens, "gemini-2.5-flash"))
                conn.commit()
            except Exception as usage_err:
                print(f"[WARNING] Failed to log token usage: {usage_err}")
                try:
                    conn.rollback()
                except:
                    pass
        
        return JSONResponse(content={
            "response": response.text,
            "citations": citations,
            "title": new_title
        })
        
    except Exception as e:
        conn.rollback()
        err_str = str(e).lower()
        print(f"Error calling Gemini: {e}")
        
        is_rate_limit = any(x in err_str for x in ["429", "quota", "exhausted", "limit", "tpm", "rpm"])
        is_overloaded = any(x in err_str for x in ["503", "overloaded", "unavailable", "service unavailable"])
        
        if is_rate_limit:
            raise HTTPException(
                status_code=429,
                detail="Too Many Requests: Gemini API rate limit or quota exceeded. Please wait a few moments or ask a shorter question. You can also view matching experiences in the CSEA portal."
            )
        elif is_overloaded:
            raise HTTPException(
                status_code=503,
                detail="AI Service Overloaded: The chatbot completion service is currently overloaded. Please retry in a few seconds."
            )
        else:
            raise HTTPException(
                status_code=503,
                detail=f"AI Service Failure: The chatbot completion service is currently unavailable. (Error: {str(e)})"
            )
    finally:
        cursor.close()
        conn.close()

# Launch local dev server if executed directly
if __name__ == "__main__":
    import uvicorn
    # 8005 runs successfully
    uvicorn.run("app:app", host="127.0.0.1", port=8005, reload=True)
