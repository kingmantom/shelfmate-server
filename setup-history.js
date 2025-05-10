const fs      = require("fs");
const path    = require("path");
const sqlite3 = require("sqlite3").verbose();

/* --- נתיב מוחלט ל-DB --- */
const dbPath  = path.join(__dirname, "shelfmate.db");
const db      = new sqlite3.Database(dbPath);
console.log("📁 Using DB at:", dbPath);

/* --- סכימה --- */
const schema  = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

db.exec(schema, (err) => {
  if (err) throw err;
  console.log("✅ schema loaded");

  db.run("DELETE FROM inventory_history", (err) => {
    if (err) throw err;

    const insert = db.prepare(`
      INSERT INTO inventory_history
        (barcode, year_month,
         opening, ordered, received_at,
         consumed, wasted, closing)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.all("SELECT barcode FROM inventory", (err, rows) => {
      if (err) throw err;

      const now = new Date();
      const totalMonths = 36; // שלוש שנים

      rows.forEach(({ barcode }) => {
        for (let i = 0; i < totalMonths; i++) {
          const date       = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const yearMonth  = date.toISOString().slice(0, 7); // YYYY-MM

          const opening    = Math.floor(Math.random() * 120) + 30;
          const ordered    = Math.floor(Math.random() * 60);
          const consumed   = Math.floor(Math.random() * 90);
          const wasted     = Math.floor(Math.random() * 15);
          const closing    = opening + ordered - consumed - wasted;
          const receivedAt = `${yearMonth}-05`;

          insert.run(
            barcode, yearMonth,
            opening, ordered, receivedAt,
            consumed, wasted, closing
          );
        }
      });

      insert.finalize((err) => {
        if (err) throw err;
        console.log("✅ Fixed 3-year history created");
        db.close(() => console.log("🔒 Database connection closed"));
      });
    });
  });
});
