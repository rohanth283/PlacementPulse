import hashlib
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Header, HTTPException, Depends
from api.database import get_db_connection

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
