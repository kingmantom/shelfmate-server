// server/server.js

require('dotenv').config();
console.log("🔑 Loaded BREVO_API_KEY:", process.env.BREVO_API_KEY);

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const { sendAlertEmail } = require('./brevoMailer');

const app = express();
const port = process.env.PORT || 3001;

const dbPath = path.join(__dirname, 'shelfmate.db');
console.log('📁 API USING DB:', dbPath);
const db = new sqlite3.Database(dbPath);

app.use(cors());
app.use(express.json());

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (password === 'admin' || password === 'employee') {
    return res.json({ email, role: password });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/inventory', (req, res) => {
  const limit = Number(req.query.limit);
  const sql = limit
    ? 'SELECT * FROM inventory ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM inventory ORDER BY created_at DESC';
  const params = limit ? [limit] : [];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/stats', (_req, res) => {
  db.get(
    `SELECT
        (SELECT COUNT(*) FROM inventory) AS inventory_rows,
        (SELECT COUNT(*) FROM inventory_history) AS history_rows`,
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row);
    }
  );
});

app.get('/api/inventory-history', (req, res) => {
  db.all(
    `SELECT * FROM inventory_history ORDER BY barcode, year_month DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get('/api/forecast-data', (req, res) => {
  const sql = `
    SELECT
      year_month AS year_month,
      SUM(consumed) AS total_consumed,
      SUM(ordered) AS total_ordered,
      SUM(wasted) AS total_wasted
    FROM inventory_history
    GROUP BY year_month
    ORDER BY year_month
  `;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

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
    threshold ?? 5,
    created_at || new Date().toISOString().slice(0, 10),
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.delete('/api/inventory/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM inventory WHERE id = ?', id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted' });
  });
});

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

app.get('/api/consumption-last-year', (req, res) => {
  const month = String(req.query.month || '').padStart(2, '0');
  const lastYear = new Date().getFullYear() - 1;
  const yearMonth = `${lastYear}-${month}`;

  const sql = `
    SELECT i.name,
           SUM(h.consumed) AS consumed
      FROM inventory_history AS h
      JOIN inventory AS i
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

// 🔮 תחזית עונתית לפי חודש (מתוקן לפי פורמט YYYY-MM)
app.get('/api/forecast-seasonal', (req, res) => {
  const month = String(req.query.month || '').padStart(2, '0');

  if (!month || isNaN(Number(month)) || Number(month) < 1 || Number(month) > 12) {
    return res.status(400).json({ error: 'Invalid month' });
  }

  const sql = `
    SELECT i.name,
           ROUND(AVG(h.consumed), 1) AS avg_consumed
      FROM inventory_history AS h
      JOIN inventory AS i
        ON h.barcode = i.barcode
     WHERE SUBSTR(h.year_month, 6, 2) = ?
     GROUP BY i.name
     ORDER BY i.name
  `;

  db.all(sql, [month], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

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

app.listen(port, () => {
  console.log(`🟢 Server is running on http://localhost:${port}`);
});
