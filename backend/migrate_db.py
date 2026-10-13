import sqlite3

def migrate():
    conn = sqlite3.connect("voice_agent.db")
    cursor = conn.cursor()
    
    # Ensure orders table exists with strict English statuses
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id INTEGER NOT NULL,
        seller_id TEXT NOT NULL,
        buyer_id TEXT NOT NULL,
        status TEXT DEFAULT 'interest_expressed',
        item_title TEXT NOT NULL,
        quantity REAL DEFAULT 1.0,
        unit TEXT DEFAULT 'units',
        unit_price REAL DEFAULT 0.0,
        total_amount REAL DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (listing_id) REFERENCES listings (id),
        FOREIGN KEY (seller_id) REFERENCES users (user_id),
        FOREIGN KEY (buyer_id) REFERENCES users (user_id)
    )
    """)

    # Standardize all listings to 100% English titles, units, and descriptions
    cursor.execute("""
    UPDATE listings 
    SET title = 'Wild Forest Honey',
        description = 'Pure raw mountain forest honey ethically harvested from wild bee hives.',
        unit = 'kg',
        search_tags = 'honey, wild honey, mountain forest honey, then, தேன், malaiththen'
    WHERE id = 1
    """)

    cursor.execute("""
    UPDATE listings 
    SET title = 'Pure Organic Turmeric',
        description = 'Naturally cultivated pure organic turmeric rhizomes rich in curcumin.',
        unit = 'kg',
        search_tags = 'turmeric, organic turmeric, manjal, மஞ்சள், haldi'
    WHERE id = 2
    """)

    conn.commit()

    print("\n=== SQLite Migration Report ===")
    print("Tables:", [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()])
    print("Listings in English:", cursor.execute("SELECT id, title, unit, price_per_unit, status FROM listings").fetchall())
    print("Orders Schema Info:", [col[1] for col in cursor.execute("PRAGMA table_info(orders)").fetchall()])
    conn.close()

if __name__ == "__main__":
    migrate()
