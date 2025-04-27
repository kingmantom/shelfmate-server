// server/server.js

// 0. טען משתני סביבה (חייב להיות השורה הראשונה)
require('dotenv').config();
console.log("🔑 Loaded BREVO_API_KEY:", process.env.BREVO_API_KEY);

const express           = require('express');
const sqlite3           = require('sqlite3').verbose();
const cors              = require('cors');
const path              = require('path');
// 0.1 ייבוא פונקציית שליחת המייל
const { sendAlertEmail } = require('./brevoMailer');

const app  = express();
const port = process.env.PORT || 4000;

// פתח חיבור למסד הנתונים
const dbPath = path.join(__dirname, 'shelfmate.db');
const db     = new sqlite3.Database(dbPath);

app.use(cors());
app.use(express.json());

// 🔐 0. Login – שדה email + password, מחזיר role
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (password === 'admin' || password === 'employee') {
    return res.json({ email, role: password });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// 📦 1. קבלת כל פריטי המלאי (snapshot)
app.get('/api/inventory', (req, res) => {
  db.all('SELECT * FROM inventory ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 📦 2. קבלת כל רישומי ההיסטוריה החודשית
app.get('/api/inventory-history', (req, res) => {
  db.all(
    `SELECT * 
       FROM inventory_history 
    ORDER BY barcode, year_month DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// 📊 3. קבלת נתוני Forecast: סכום צריכה/הזמנה/בזבוז לפי חודש
app.get('/api/forecast-data', (req, res) => {
  const sql = `
    SELECT
      year_month               AS year_month,
      SUM(consumed)  AS total_consumed,
      SUM(ordered)   AS total_ordered,
      SUM(wasted)    AS total_wasted
    FROM inventory_history
    GROUP BY year_month
    ORDER BY year_month
  `;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 📣 4. קבלת מוצרים במלאי נמוך (כמות < threshold)
app.get('/api/low-stock', (req, res) => {
  const sql = `
    SELECT id, name, barcode, quantity, threshold
      FROM inventory
     WHERE quantity < threshold
     ORDER BY name
  `;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ➕ 5. הוספת מוצר חדש
app.post('/api/inventory', (req, res) => {
  const { name, barcode, quantity, desired_quantity, threshold, created_at } = req.body;
  const stmt = db.prepare(`
    INSERT INTO inventory 
      (name, barcode, quantity, desired_quantity, threshold, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    name,
    barcode,
    quantity,
    desired_quantity,
    threshold ?? 5,  // ברירת מחדל לסף
    created_at || new Date().toISOString().slice(0, 10),
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// 🗑️ 6. מחיקת מוצר על פי ID
app.delete('/api/inventory/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM inventory WHERE id = ?', id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted' });
  });
});

// 🛠️ 7. עדכון דינמי: quantity, desired_quantity, threshold
app.put('/api/inventory/:id', (req, res) => {
  const { id } = req.params;
  const { quantity, desired_quantity, threshold } = req.body;

  const fields = [];
  const params = [];

  if (quantity !== undefined) {
    fields.push('quantity = ?');
    params.push(quantity);
  }
  if (desired_quantity !== undefined) {
    fields.push('desired_quantity = ?');
    params.push(desired_quantity);
  }
  if (threshold !== undefined) {
    fields.push('threshold = ?');
    params.push(threshold);
  }
  if (!fields.length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  params.push(id);
  const sql = `UPDATE inventory SET ${fields.join(', ')} WHERE id = ?`;
  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Updated', changes: this.changes });
  });
});

// 📊 8. צריכה לפי מוצר בחודש בשנה שעברה
app.get('/api/consumption-last-year', (req, res) => {
  const month     = String(req.query.month || '').padStart(2, '0');
  const lastYear  = new Date().getFullYear() - 1;
  const yearMonth = `${lastYear}-${month}`;

  const sql = `
    SELECT i.name,
           SUM(h.consumed) AS consumed
      FROM inventory_history AS h
      JOIN inventory         AS i
        ON i.barcode = h.barcode
     WHERE h.year_month = ?
     GROUP BY i.name
     ORDER BY i.name
  `;

  db.all(sql, [yearMonth], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 🚨 9. מסלול לשליחת מיילי התראה
app.post('/api/send-alert', async (req, res) => {
  const { email, subject, html } = req.body;
  try {
    await sendAlertEmail(email, subject, html);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error sending alert email:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🔀 (prod) – serve static React build
/*
app.use(express.static(path.join(__dirname, '../shelfmate-frontend/build')));
app.get('/*', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../shelfmate-frontend/build', 'index.html')
  );
});
*/

// הפעלת ה־API
app.listen(port, () => {
  console.log(`🟢 Server is running on http://localhost:${port}`);
});
