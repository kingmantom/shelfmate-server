const fs   = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./shelfmate.db");

/* ➊ טוענים את schema.sql – יוצר את שתי הטבלאות אם לא קיימות */
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema, (err) => {
  if (err) {
    console.error("❌  failed to load schema:", err.message);
    process.exit(1);
  }
  console.log("✅  schema loaded");

  /* ➋ מאפסים וממלאים את טבלת inventory בלבד */
  db.serialize(() => {
    db.run("DELETE FROM inventory");

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

    const products = ["קולה","מים","חלב","במבה","חטיף אנרגיה","יוגורט","שוקולד"];
    const today = new Date();

    for (let i = 0; i < 40; i++) {
      const name      = products[Math.floor(Math.random() * products.length)];
      const barcode   = "729000" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
      const quantity  = Math.floor(Math.random() * 30);
      const desired   = 15 + Math.floor(Math.random() * 10);
      const threshold = 5 + Math.floor(Math.random() * 6);  // סף אקראי בין 5 ל-10
      const dateStr   = today.toISOString().split("T")[0];

      stmt.run(name, barcode, quantity, desired, threshold, dateStr);
    }
    stmt.finalize(() => {
      console.log("✅  inventory mock data inserted");
      db.close();
    });
  });
});
