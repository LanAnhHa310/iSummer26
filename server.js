require('dotenv').config();

const { Parser } = require('json2csv');
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

    const {
      name,
      grp,
      age,
      english_name
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO students
      (
        name,
        grp,
        age,
        english_name
      )
      VALUES ($1,$2,$3,$4)
      RETURNING *
      `,
      [
        name,
        grp || 'Nhóm A',
        age || null,
        english_name || null
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

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

app.get('/api/export/students', async (req,res)=>{

  try{

    const students =
      await pool.query(
        `
        SELECT *
        FROM students
        ORDER BY grp,name
        `
      );

    let csv = '';

    for(const s of students.rows){

      let badge = 'Camp Explorer';

      if(s.lifetime_stars >= 50)
        badge = 'Superstar';

      else if(s.lifetime_stars >= 30)
        badge = 'Leader';

      csv += `
====================================
HỌC SINH
====================================

Tên,${s.name}
Tên tiếng Anh,${s.english_name || ''}
Tuổi,${s.age || ''}
Nhóm,${s.grp}

Sao hiện có,${s.stars}
Tổng sao tích luỹ,${s.lifetime_stars}
Đổi quà,${s.rewards_redeemed}

Huy hiệu,${badge}

`;

      // ATTENDANCE

      const attendance =
        await pool.query(
          `
          SELECT *
          FROM attendance
          WHERE student_id=$1
          ORDER BY date
          `,
          [s.id]
        );

      csv += `
ĐIỂM DANH

Ngày,Trạng thái
`;

      attendance.rows.forEach(a=>{

        csv += `
${a.date},${a.status}
`;

      });

      // DIARY

      const diary =
        await pool.query(
          `
          SELECT *
          FROM diary
          WHERE student_id=$1
          ORDER BY date
          `,
          [s.id]
        );

      csv += `

HÀNH TRÌNH CẢM XÚC

Ngày,Cảm xúc
`;

      diary.rows.forEach(d=>{

        csv += `
${d.date},${d.emotion}
`;

      });

      // EVALUATIONS

      const evaluations =
        await pool.query(
          `
          SELECT *
          FROM evaluations
          WHERE student_id=$1
          ORDER BY week
          `,
          [s.id]
        );

      csv += `

ĐÁNH GIÁ PHÁT TRIỂN

Tuần,English,Participation,Teamwork,Learning,Self Management,Tổng điểm,Nhận xét
`;

      evaluations.rows.forEach(e=>{

        const total =
          Number(e.english||0)+
          Number(e.participation||0)+
          Number(e.teamwork||0)+
          Number(e.learning||0)+
          Number(e.self_management||0);

        csv += `
${e.week},
${e.english},
${e.participation},
${e.teamwork},
${e.learning},
${e.self_management},
${total},
"${e.teacher_comment || ''}"
`;

      });

      csv += `

====================================

`;

    }

    res.header(
      'Content-Type',
      'text/csv; charset=utf-8'
    );

    res.attachment(
      `isummer-full-report.csv`
    );

    res.send(csv);

  }catch(err){

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});

// ==================== STUDENT EVALUATION ====================

// Save evaluation
app.post('/api/evaluation', async (req,res)=>{

  try{

    const {
      student_id,
      week,
      english,
      participation,
      teamwork,
      learning,
      self_management,
      teacher_comment
    } = req.body;

    await pool.query(
      `
      INSERT INTO evaluations
      (
        student_id,
        week,
        english,
        participation,
        teamwork,
        learning,
        self_management,
        teacher_comment
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8)

      ON CONFLICT(student_id,week)

      DO UPDATE SET

      english = EXCLUDED.english,
      participation = EXCLUDED.participation,
      teamwork = EXCLUDED.teamwork,
      learning = EXCLUDED.learning,
      self_management = EXCLUDED.self_management,
      teacher_comment = EXCLUDED.teacher_comment
      `,
      [
        student_id,
        week,
        english,
        participation,
        teamwork,
        learning,
        self_management,
        teacher_comment
      ]
    );

    res.json({ok:true});

  }catch(err){

    res.status(500).json({
      error:err.message
    });

  }
});

// Get evaluation
app.get(
  '/api/evaluation/:studentId/:week',
  async(req,res)=>{

    try{

      const result = await pool.query(
        `
        SELECT *
        FROM evaluations
        WHERE student_id = $1
        AND week = $2
        `,
        [
          req.params.studentId,
          req.params.week
        ]
      );

      res.json(
        result.rows[0] || {}
      );

    }catch(err){

      res.status(500).json({
        error: err.message
      });

    }

});

// Evaluation status
app.get(
  '/api/evaluations/status/:week',
  async (req,res) => {

    try {

      const result = await pool.query(
        `
        SELECT
          s.id,
          s.name,
          s.grp,

          CASE
            WHEN e.id IS NULL
            THEN false
            ELSE true
          END AS evaluated

        FROM students s

        LEFT JOIN evaluations e
        ON s.id = e.student_id
        AND e.week = $1

        ORDER BY s.grp, s.name
        `,
        [req.params.week]
      );

      res.json(result.rows);

    } catch(err){

      res.status(500).json({
        error: err.message
      });

    }

});

app.delete(
  '/api/evaluation/:studentId/:week',
  async(req,res)=>{

    try{

      await pool.query(
        `
        DELETE FROM evaluations
        WHERE student_id = $1
        AND week = $2
        `,
        [
          req.params.studentId,
          req.params.week
        ]
      );

      res.json({ ok:true });

    }catch(err){

      res.status(500).json({
        error: err.message
      });

    }

});

// ==== EMOTION CHART ==== 
app.get(
  '/api/report/student/:id',
  async (req,res)=>{

    const student =
      await pool.query(
        `
        SELECT
          id,
          name,
          grp,
          age,
          english_name,
          stars,
          rewards_redeemed,
          lifetime_stars
        FROM students
        WHERE id = $1
        `,
        [req.params.id]
      );

    const evaluations =
      await pool.query(
        `
        SELECT
          week,

          (
            english +
            participation +
            teamwork +
            learning +
            self_management
          ) AS total_score

        FROM evaluations

        WHERE student_id = $1
        `,
        [req.params.id]
      );

    const result = {
      ...student.rows[0],
      week1: null,
      week4: null,
      week8: null
    };

    evaluations.rows.forEach(e => {

      if(e.week == 1)
        result.week1 = e.total_score;

      if(e.week == 4)
        result.week4 = e.total_score;

      if(e.week == 8)
        result.week8 = e.total_score;

    });

    res.json(result);

});

app.get(
  '/api/report/diary/:id',
  async(req,res)=>{

    const result =
      await pool.query(
        `
        SELECT
          date,
          color,
          emotion

        FROM diary

        WHERE student_id = $1

        ORDER BY date
        `,
        [req.params.id]
      );

    res.json(
      result.rows
    );

});

app.get('/api/export/student/:id', async (req,res)=>{

  try{

    const id = req.params.id;

    const student =
      await pool.query(
        `
        SELECT *
        FROM students
        WHERE id = $1
        `,
        [id]
      );

    if(!student.rows.length){

      return res.status(404).send(
        'Student not found'
      );

    }

    const s = student.rows[0];

    let badge = 'Camp Explorer';

    if(
      (s.lifetime_stars || 0)
      >= 50
    ){
      badge = 'Superstar';
    }
    else if(
      (s.lifetime_stars || 0)
      >= 30
    ){
      badge = 'Leader';
    }

    let csv = '';

    csv += `
THÔNG TIN HỌC SINH

Tên,${s.name}
Tên tiếng Anh,${s.english_name || ''}
Tuổi,${s.age || ''}
Nhóm,${s.grp}

Sao hiện có,${s.stars || 0}
Tổng sao tích luỹ,${s.lifetime_stars || 0}

Đổi quà,${s.rewards_redeemed || 0}

Huy hiệu,${badge}

`;

    // ATTENDANCE

    const attendance =
      await pool.query(
        `
        SELECT *
        FROM attendance
        WHERE student_id = $1
        ORDER BY date
        `,
        [id]
      );

    csv += `
ĐIỂM DANH

Ngày,Trạng thái
`;

    attendance.rows.forEach(a=>{

      csv += `
${a.date},${a.status}
`;

    });

    // DIARY

    const diary =
      await pool.query(
        `
        SELECT *
        FROM diary
        WHERE student_id = $1
        ORDER BY date
        `,
        [id]
      );

    csv += `

HÀNH TRÌNH CẢM XÚC

Ngày,Cảm xúc
`;

    diary.rows.forEach(d=>{

      csv += `
${d.date},${d.emotion || ''}
`;

    });

    // EVALUATION

    const evaluations =
      await pool.query(
        `
        SELECT *
        FROM evaluations
        WHERE student_id = $1
        ORDER BY week
        `,
        [id]
      );

    csv += `

ĐÁNH GIÁ PHÁT TRIỂN

Tuần,English,Participation,Teamwork,Learning,Self Management,Tổng điểm,Xếp loại,Nhận xét
`;

    evaluations.rows.forEach(e=>{

      const total =
        Number(e.english || 0) +
        Number(e.participation || 0) +
        Number(e.teamwork || 0) +
        Number(e.learning || 0) +
        Number(e.self_management || 0);

      let level = '';

      if(total >= 22)
        level = 'Xuất sắc';
      else if(total >= 18)
        level = 'Tốt';
      else if(total >= 13)
        level = 'Đạt yêu cầu';
      else
        level = 'Cần hỗ trợ';

      csv += `
${e.week},
${e.english},
${e.participation},
${e.teamwork},
${e.learning},
${e.self_management},
${total},
${level},
"${e.teacher_comment || ''}"
`;

    });

    res.header(
      'Content-Type',
      'text/csv; charset=utf-8'
    );

    res.attachment(
      `HoSo_${s.name}.csv`
    );

    res.send(csv);

  }catch(err){

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});

app.listen(PORT, () => {
  console.log(`iSUMMER running on port ${PORT}`);
});
