require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3030;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// STUDENTS

app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM students ORDER BY grp, name'
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const { name, grp } = req.body;

    const result = await pool.query(
      'INSERT INTO students(name, grp) VALUES($1,$2) RETURNING *',
      [name, grp || 'Nhóm A']
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const id = req.params.id;

    console.log('Trying to delete student:', id);

    await pool.query('DELETE FROM attendance WHERE student_id = $1', [id]);
    await pool.query('DELETE FROM diary WHERE student_id = $1', [id]);

    const result = await pool.query(
      'DELETE FROM students WHERE id = $1 RETURNING *',
      [id]
    );

    console.log('Deleted:', result.rows);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// ATTENDANCE

app.get('/api/attendance/:date', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        s.id,
        s.name,
        s.grp,
        COALESCE(a.status,'') AS status
      FROM students s
      LEFT JOIN attendance a
        ON s.id = a.student_id
        AND a.date = $1
      ORDER BY s.grp, s.name
      `,
      [req.params.date]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const { student_id, date, status } = req.body;

    await pool.query(
      `
      INSERT INTO attendance(student_id,date,status)
      VALUES($1,$2,$3)
      ON CONFLICT(student_id,date)
      DO UPDATE SET status = EXCLUDED.status
      `,
      [student_id, date, status]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DIARY

app.get('/api/diary/:date', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        s.id,
        s.name,
        s.grp,
        d.color,
        d.emotion
      FROM students s
      LEFT JOIN diary d
        ON s.id = d.student_id
        AND d.date = $1
      ORDER BY s.grp, s.name
      `,
      [req.params.date]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/diary', async (req, res) => {
  try {
    const { student_id, date, color, emotion } = req.body;

    await pool.query(
      `
      INSERT INTO diary(student_id,date,color,emotion)
      VALUES($1,$2,$3,$4)
      ON CONFLICT(student_id,date)
      DO UPDATE SET
      color = EXCLUDED.color,
      emotion = EXCLUDED.emotion
      `,
      [student_id, date, color, emotion]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REPORTS

app.get('/api/report/diary/:student_id', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT date,color,emotion
      FROM diary
      WHERE student_id = $1
      ORDER BY date
      `,
      [req.params.student_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/report/attendance-summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.name,
        s.grp,
        SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent
      FROM students s
      LEFT JOIN attendance a
        ON s.id = a.student_id
      GROUP BY s.id
      ORDER BY s.grp, s.name
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`iSUMMER running on port ${PORT}`);
});
