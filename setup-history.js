// Server/setup-history.js
const fs      = require("fs");
const sqlite3 = require("sqlite3").verbose();
const db      = new sqlite3.Database("./shelfmate.db");

// ‑‑‑ 1. טוענים/מייצרים סכימה ‑‑‑
const schema = fs.readFileSync("./schema.sql", "utf8");
db.exec(schema, (err) => {
  if (err) throw err;
  console.log("✅ schema loaded");

  // ‑‑‑ 2. מוחקים רשומות היסטוריה קודמות ‑‑‑
  db.run("DELETE FROM inventory_history", (err) => {
    if (err) throw err;

    // ‑‑‑ 3. מכינים INSERT עם כל השדות החדשים ‑‑‑
    const insert = db.prepare(`
      INSERT INTO inventory_history
        (barcode, year_month,
         opening, ordered, received_at,
         consumed, wasted, closing)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // ‑‑‑ 4. עבור כל ברקוד יוצרים 12 חודשים אחורה ‑‑‑
    db.all("SELECT barcode FROM inventory", (err, rows) => {
      if (err) throw err;

      const now = new Date();
      rows.forEach(({ barcode }) => {
        for (let m = 0; m < 12; m++) {
          // תאריך 1‑בחודש אחורה m חודשים
          const date = new Date(now.getFullYear(), now.getMonth() - m, 1);
          const yearMonth = date.toISOString().slice(0, 7); // YYYY‑MM

          // --- ערכי דמה ריאליים ---
          const opening   = Math.floor(Math.random() * 120) + 30; // מלאי פתיחה
          const ordered   = Math.floor(Math.random() * 60);       // הוזמן
          const consumed  = Math.floor(Math.random() * 90);       // נצרך
          const wasted    = Math.floor(Math.random() * 15);       // נזרק
          const closing   = opening + ordered - consumed - wasted;// מלאי סגירה
          const receivedAt = `${yearMonth}-05`;                   // אספקה ב‑5 לחודש

          insert.run(
            barcode, yearMonth,
            opening, ordered, receivedAt,
            consumed, wasted, closing
          );
        }
      });

      // ‑‑‑ 5. סוגרים הכול ‑‑‑
      insert.finalize((err) => {
        if (err) throw err;
        console.log("✅ Fake monthly history created");
        db.close(() => console.log("🔒 Database connection closed"));
      });
    });
  });
});
