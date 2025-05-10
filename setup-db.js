// setup-db.js – מאפס ומזין 40 מוצרים (באנגלית)
const fs      = require("fs");
const path    = require("path");
const sqlite3 = require("sqlite3").verbose();

/* 1) נתיב מוחלט לקובץ DB */
const dbPath = path.join(__dirname, "shelfmate.db");
console.log("📁 Using DB at:", dbPath);
const db = new sqlite3.Database(dbPath);

/* 2) טעינת schema */
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

db.exec(schema, (err) => {
  if (err) {
    console.error("❌ failed to load schema:", err.message);
    process.exit(1);
  }
  console.log("✅ schema loaded");

  /* 3) איפוס ומילוי הטבלה */
  db.serialize(() => {
    db.run("DELETE FROM inventory", (err) => {
      if (err) {
        console.error("❌ failed to clear inventory:", err.message);
        process.exit(1);
      }
    });

    const stmt = db.prepare(`
      INSERT INTO inventory (
        name,
        barcode,
        quantity,
        desired_quantity,
        threshold,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    // 🔠 שמות המוצרים באנגלית
    const products = [
      "Cola", "Water", "Milk", "Bamba",
      "Energy Bar", "Yogurt", "Chocolate"
    ];
    const today = new Date();

    for (let i = 0; i < 40; i++) {
      const name      = products[Math.floor(Math.random() * products.length)];
      const barcode   = Math.random().toString().slice(2, 15); // 13 ספרות
      const quantity  = Math.floor(Math.random() * 30);
      const desired   = 15 + Math.floor(Math.random() * 10);
      const threshold = 5  + Math.floor(Math.random() * 6);
      const dateStr   = today.toISOString().split("T")[0];

      stmt.run(
        name, barcode, quantity, desired, threshold, dateStr,
        (err) => { if (err) console.error("❌ insert failed:", err.message); }
      );
    }

    stmt.finalize((err) => {
      if (err) {
        console.error("❌ stmt finalize error:", err.message);
        process.exit(1);
      }

      db.get("SELECT COUNT(*) AS n FROM inventory", (_, row) => {
        console.log("📊 rows in inventory =", row.n);
        console.log("✅ inventory mock data inserted");
        db.close(() => console.log("🔒 Database connection closed"));
      });
    });
  });
});
