CREATE TABLE IF NOT EXISTS inventory (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT       NOT NULL,
    barcode          TEXT UNIQUE,
    quantity         INTEGER    DEFAULT 0,
 
    threshold        INTEGER    DEFAULT 5,
    created_at       TEXT       DEFAULT (DATE('now')),
    expiry_date      TEXT       DEFAULT NULL               -- ✅ שדה חדש: תאריך תוקף
);


/* טבלת היסטוריית צריכה חודשית */
CREATE TABLE IF NOT EXISTS inventory_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode     TEXT NOT NULL,               -- קישור ל‑inventory.barcode
  year_month  TEXT NOT NULL,               -- YYYY‑MM
  opening     INTEGER DEFAULT 0,           -- מלאי פתיחה
  ordered     INTEGER DEFAULT 0,           -- כמה הוזמן בחודש
  received_at TEXT,                        -- תאריך אספקה בפועל (YYYY‑MM‑DD)
  consumed    INTEGER DEFAULT 0,           -- כמה נצרך
  wasted      INTEGER DEFAULT 0,           -- כמה נזרק
  closing     INTEGER DEFAULT 0            -- מלאי סגירה (לבדיקה)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_unique
  ON inventory_history (barcode, year_month);


/* אפשרות להבטיח ייחוד חודשי */
CREATE UNIQUE INDEX IF NOT EXISTS idx_history_unique
ON inventory_history (barcode, year_month);
