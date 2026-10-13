import sqlite3

def run_migration():
    conn = sqlite3.connect("voice_agent.db")
    cursor = conn.cursor()

    print("Running SQLite E-commerce flow migration...")

    # 1. Ensure orders table has delivery_time column
    try:
        cursor.execute("ALTER TABLE orders ADD COLUMN delivery_time TEXT")
        print("Added delivery_time column to orders.")
    except Exception as e:
        print("delivery_time column already present or:", e)

    # 2. Create order_items table strictly in English
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        listing_id INTEGER NOT NULL,
        item_title TEXT NOT NULL,
        quantity REAL DEFAULT 1.0,
        unit TEXT DEFAULT 'units',
        unit_price REAL DEFAULT 0.0,
        total_price REAL DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders (id),
        FOREIGN KEY (listing_id) REFERENCES listings (id)
    )
    """)
    print("Created order_items table.")

    # 3. Create order_history table strictly in English
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        action TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders (id)
    )
    """)
    print("Created order_history table.")

    # 4. Create history table strictly in English
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT DEFAULT 'order',
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    print("Created history table.")

    conn.commit()

    # Verify tables
    tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    print("Current SQLite Tables in voice_agent.db:", tables)
    conn.close()

if __name__ == "__main__":
    run_migration()
