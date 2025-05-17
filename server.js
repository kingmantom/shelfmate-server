// ------------------ server/server.js ------------------
require('dotenv').config();
const express      = require('express');
const sqlite3      = require('sqlite3').verbose();
const cors         = require('cors');
const path         = require('path');
const { sendAlertEmail } = require('./brevoMailer');

const app  = express();
const port = process.env.PORT || 3001;

const dbPath = path.join(__dirname, 'shelfmate.db');
console.log('📁 API USING DB:', dbPath);
const db = new sqlite3.Database(dbPath);

app.use(cors());
app.use(express.json());



// 🔐 Login route
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (password === 'admin' && email === 'tomwas2000@gmail.com') {
    return res.json({ email, role: 'admin' });
  }
  if (password === 'employee') {
    return res.json({ email, role: 'employee' });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// 📦 Get all inventory items
app.get('/api/inventory', (req, res) => {
  const limit = Number(req.query.limit);
  const baseSql = `
    SELECT id, name, barcode, quantity, threshold, expiry_date
    FROM inventory ORDER BY created_at DESC
  `;
  const sql = limit ? baseSql + ' LIMIT ?' : baseSql;
  const params = limit ? [limit] : [];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});


// 📊 Stats for DB
app.get('/api/stats', (_req, res) => {
  db.get(`
    SELECT
      (SELECT COUNT(*) FROM inventory) AS inventory_rows,
      (SELECT COUNT(*) FROM inventory_history) AS history_rows
  `, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// 📦 Inventory history
app.get('/api/inventory-history', (_req, res) => {
  db.all(`
    SELECT * FROM inventory_history
    ORDER BY barcode, year_month DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 📊 Forecast data
app.get('/api/forecast-data', (_req, res) => {
  const sql = `
    SELECT year_month, SUM(consumed) AS total_consumed,
           SUM(ordered) AS total_ordered,
           SUM(wasted) AS total_wasted
    FROM inventory_history
    GROUP BY year_month ORDER BY year_month
  `;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 📣 Low stock + expiry alerts
app.get('/api/low-stock', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const sql = `
    SELECT id, name, barcode, quantity, threshold, expiry_date
    FROM inventory
    WHERE quantity < threshold OR expiry_date = ? OR expiry_date < ?
    ORDER BY name
  `;
  db.all(sql, [today, today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
// ייצוא מלאי לאקסל
const ExcelJS = require("exceljs");

app.get('/api/export-inventory', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory");

  // כותרות עמודות
  sheet.columns = [
    { header: "שם מוצר", key: "name" },
    { header: "ברקוד", key: "barcode" },
    { header: "כמות", key: "quantity" },
    { header: "סף התראה", key: "threshold" },
    { header: "תוקף", key: "expiry_date" },
  ];

  db.all(`SELECT name, barcode, quantity, threshold, expiry_date FROM inventory`, [], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    rows.forEach(row => sheet.addRow(row));

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=inventory_export.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  });
});

// ➕ Add new product
app.post('/api/inventory', (req, res) => {
  const { name, barcode, quantity, threshold, created_at, expiry_date } = req.body;
  const stmt = db.prepare(`
    INSERT INTO inventory (name, barcode, quantity, threshold, created_at, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(name, barcode, quantity, threshold ?? 5, created_at || new Date().toISOString().slice(0, 10), expiry_date || null,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    });
});

// 🗑️ Delete product
app.delete('/api/inventory/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM inventory WHERE id = ?', id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted' });
  });
});

// 🛠️ Update product
app.put('/api/inventory/:id', (req, res) => {
  const { id } = req.params;
  const { quantity, threshold, expiry_date } = req.body;
  const fields = [];
  const params = [];

  if (quantity     !== undefined) fields.push('quantity = ?')     && params.push(quantity);
  if (threshold    !== undefined) fields.push('threshold = ?')    && params.push(threshold);
  if (expiry_date  !== undefined) fields.push('expiry_date = ?')  && params.push(expiry_date);
  if (!fields.length) return res.status(400).json({ error: 'No valid fields to update' });

  params.push(id);
  const sql = `UPDATE inventory SET ${fields.join(', ')} WHERE id = ?`;
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Updated', changes: this.changes });
  });
});

// 📊 Last year's consumption by month
app.get('/api/consumption-last-year', (req, res) => {
  const month = String(req.query.month || '').padStart(2, '0');
  const lastYear = new Date().getFullYear() - 1;
  const yearMonth = `${lastYear}-${month}`;

  const sql = `
    SELECT i.name, SUM(h.consumed) AS consumed
    FROM inventory_history h
    JOIN inventory i ON i.barcode = h.barcode
    WHERE h.year_month = ?
    GROUP BY i.name
    ORDER BY i.name
  `;
  db.all(sql, [yearMonth], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 🔮 Forecast by month
app.get('/api/forecast-seasonal', (req, res) => {
  const month = String(req.query.month || '').padStart(2, '0');
  if (!month || isNaN(Number(month)) || Number(month) < 1 || Number(month) > 12) {
    return res.status(400).json({ error: 'Invalid month' });
  }

  const sql = `
    SELECT i.name, ROUND(AVG(h.consumed), 1) AS avg_consumed
    FROM inventory_history h
    JOIN inventory i ON h.barcode = i.barcode
    WHERE SUBSTR(h.year_month, 6, 2) = ?
    GROUP BY i.name
    ORDER BY i.name
  `;
  db.all(sql, [month], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 🚨 Send alert email
app.post('/api/send-alert', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sql = `
      SELECT name, quantity, threshold, expiry_date
      FROM inventory
      WHERE quantity < threshold OR expiry_date = ? OR expiry_date < ?
    `;
    db.all(sql, [today, today], async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (rows.length === 0) return res.json({ ok: true, message: "אין התראות" });

      let html = `<h2>📦 ShelfMate – התראות מלאי ותוקף</h2><ul>`;
      rows.forEach(item => {
        const expired = item.expiry_date && item.expiry_date < today;
        const expiresToday = item.expiry_date === today;
        const expiryNote = expired ? '❌ פג תוקף' : (expiresToday ? '⚠️ תפוגה היום' : '');
        const lowStockNote = item.quantity < item.threshold ? '🔻 מלאי נמוך' : '';
        const extra = [expiryNote, lowStockNote].filter(Boolean).join(', ');

        html += `<li><strong>${item.name}</strong> – כמות: ${item.quantity}, סף: ${item.threshold}, תוקף: ${item.expiry_date || "—"} ${extra ? `(${extra})` : ''}</li>`;
      });
      html += '</ul>';

      await sendAlertEmail(req.body.email || "tomwas2000@gmail.com", "📢 ShelfMate – התראות מלאי ותוקף", html);
      res.json({ ok: true });
    });
  } catch (err) {
    console.error("❌ Email send error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`🟢 Server is running on http://localhost:${port}`);
});
