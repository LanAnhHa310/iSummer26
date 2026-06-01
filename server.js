const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3030;
const db = new sqlite3.Database('./isummer.db');

// ── Schema ────────────────────────────────────────────────────────────────────
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    grp   TEXT DEFAULT 'Nhóm A'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    date       TEXT,
    status     TEXT DEFAULT 'present',
    UNIQUE(student_id, date)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS diary (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    date       TEXT,
    color      TEXT,
    emotion    TEXT,
    UNIQUE(student_id, date)
  )`);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Students ──────────────────────────────────────────────────────────────────
app.get('/api/students', (_, res) =>
  db.all('SELECT * FROM students ORDER BY grp, name', (e, r) =>
    e ? res.status(500).json({ error: e.message }) : res.json(r)));

app.post('/api/students', (req, res) => {
  const { name, grp } = req.body;
  db.run('INSERT INTO students (name, grp) VALUES (?, ?)', [name, grp || 'Nhóm A'],
    function(e) { e ? res.status(500).json({ error: e.message })
                    : res.json({ id: this.lastID, name, grp: grp || 'Nhóm A' }); });
});

app.delete('/api/students/:id', (req, res) => {
  db.run('DELETE FROM students WHERE id = ?', [req.params.id],
    e => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

// ── Attendance ────────────────────────────────────────────────────────────────
app.get('/api/attendance/:date', (req, res) =>
  db.all(`SELECT s.id, s.name, s.grp, COALESCE(a.status,'') AS status
          FROM students s
          LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
          ORDER BY s.grp, s.name`, [req.params.date],
    (e, r) => e ? res.status(500).json({ error: e.message }) : res.json(r)));

app.post('/api/attendance', (req, res) => {
  const { student_id, date, status } = req.body;
  db.run(`INSERT INTO attendance (student_id, date, status) VALUES (?,?,?)
          ON CONFLICT(student_id,date) DO UPDATE SET status=excluded.status`,
    [student_id, date, status],
    e => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

// ── Diary ─────────────────────────────────────────────────────────────────────
app.get('/api/diary/:date', (req, res) =>
  db.all(`SELECT s.id, s.name, s.grp, d.color, d.emotion
          FROM students s
          LEFT JOIN diary d ON s.id = d.student_id AND d.date = ?
          ORDER BY s.grp, s.name`, [req.params.date],
    (e, r) => e ? res.status(500).json({ error: e.message }) : res.json(r)));

app.post('/api/diary', (req, res) => {
  const { student_id, date, color, emotion } = req.body;
  db.run(`INSERT INTO diary (student_id, date, color, emotion) VALUES (?,?,?,?)
          ON CONFLICT(student_id,date) DO UPDATE SET color=excluded.color, emotion=excluded.emotion`,
    [student_id, date, color, emotion],
    e => e ? res.status(500).json({ error: e.message }) : res.json({ ok: true }));
});

// ── Reports ───────────────────────────────────────────────────────────────────
app.get('/api/report/diary/:student_id', (req, res) =>
  db.all(`SELECT date, color, emotion FROM diary
          WHERE student_id = ? ORDER BY date`, [req.params.student_id],
    (e, r) => e ? res.status(500).json({ error: e.message }) : res.json(r)));

app.get('/api/report/attendance-summary', (_, res) =>
  db.all(`SELECT s.name, s.grp,
            SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN a.status='late'    THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) AS absent
          FROM students s LEFT JOIN attendance a ON s.id=a.student_id
          GROUP BY s.id ORDER BY s.grp, s.name`,
    (e, r) => e ? res.status(500).json({ error: e.message }) : res.json(r)));

app.listen(PORT, () =>
  console.log(`\n🌈 iSUMMER App → http://localhost:${PORT}\n`));
