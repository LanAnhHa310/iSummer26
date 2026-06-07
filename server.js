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
      'INSERT INTO students(name, grp, age, english_name) VALUES($1,$2,$3,$4) RETURNING *',
      [
        name, 
        grp || 'Nhóm A',
        age || null,
        english_name || null
      ]
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

// ==================== STAR SYSTEM ====================

// Add stars
app.post('/api/students/:id/add-stars', async (req, res) => {
  try {
    const { amount } = req.body;

    const result = await pool.query(
      `
      UPDATE students
      SET
        stars = stars + $1,
        lifetime_stars = lifetime_stars + $1
      WHERE id = $2
      RETURNING *
      `,
      [amount, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Redeem reward
app.post('/api/students/:id/redeem', async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE students
      SET
        stars = stars - 10,
        rewards_redeemed = rewards_redeemed + 1
      WHERE id = $1
      AND stars >= 10
      RETURNING *
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'Not enough stars'
      });
    }

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        id,
        name,
        grp,
        stars,
        lifetime_stars,
        rewards_redeemed
      FROM students
      ORDER BY lifetime_stars DESC
      LIMIT 10
    `);

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/students/:id', async (req,res) => {
  try {

    const {
      name,
      age,
      english_name,
      grp
    } = req.body;

    const result = await pool.query(
      `
      UPDATE students
      SET
        name = $1,
        age = $2,
        english_name = $3,
        grp = $4
      WHERE id = $5
      RETURNING *
      `,
      [
        name,
        age,
        english_name,
        grp,
        req.params.id
      ]
    );

    res.json(result.rows[0]);

  } catch(err) {

    res.status(500).json({
      error: err.message
    });

  }
});

app.listen(PORT, () => {
  console.log(`iSUMMER running on port ${PORT}`);
});
