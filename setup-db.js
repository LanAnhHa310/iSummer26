require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      grp TEXT DEFAULT 'Nhóm A'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id),
      date TEXT,
      status TEXT DEFAULT 'present',
      UNIQUE(student_id, date)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS diary (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id),
      date TEXT,
      color TEXT,
      emotion TEXT,
      UNIQUE(student_id, date)
    );
  `);

  console.log('✅ Tables created');
  process.exit();
}

setup().catch(console.error);
