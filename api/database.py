import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

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
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS gemini_api_key VARCHAR(255);")
        
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
            # Hash helper inside database.py or inline
            import hashlib
            def local_hash_password(password: str) -> str:
                salt = b"placement_pulse_salt_1234"
                hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
                return hash_bytes.hex()
            admin_hash = local_hash_password("admin123")
            cursor.execute("SELECT id FROM users WHERE username = 'admin'")
            if cursor.fetchone():
                cursor.execute("UPDATE users SET is_admin = TRUE, password_hash = %s WHERE username = 'admin'", (admin_hash,))
            else:
                cursor.execute("INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', %s, TRUE)", (admin_hash,))
            print("[SEED] Default admin seeded successfully: admin / admin123")
        
        conn.commit()
        cursor.close()
        conn.close()
        print("Database initialized successfully.")
    except Exception as e:
        print(f"Error initializing database: {e}")
