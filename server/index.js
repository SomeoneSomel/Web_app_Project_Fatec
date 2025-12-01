require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Multer (mesma configuração)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random()*1e6) + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens (png/jpg/webp)'));
  }
});

// DB pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5000,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'pintolao123',
  database: process.env.DB_NAME || 'cidade_perfeita',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

// Função pra garantir que a tabela exista e que original_id exista
async function ensureTable() {
  const createSql = `
  CREATE TABLE IF NOT EXISTS reports (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    original_id BIGINT NULL,
    reporter VARCHAR(120) DEFAULT 'Anônimo',
    reporterId VARCHAR(200) DEFAULT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'outros',
    photoPath VARCHAR(400) NOT NULL,
    location_lat DOUBLE DEFAULT NULL,
    location_lng DOUBLE DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  await pool.query(createSql);

  // garante que a coluna original_id exista (caso tabela antiga não tenha)
  try {
    await pool.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS original_id BIGINT NULL;');
  } catch (e) {
    // alguns MySQL antigos não suportam IF NOT EXISTS — ignoramos o erro
  }

  // tenta criar índice único em original_id para evitar duplicatas (suprime erro se já existir)
  try {
    await pool.query('CREATE UNIQUE INDEX uq_reports_original_id ON reports (original_id);');
  } catch (e) {
    // ignora erro se já existe ou não suportado
  }
}
ensureTable().catch(err => {
  console.error('Erro criando/ajustando tabela:', err);
  process.exit(1);
});

// Serve imagens
app.use('/uploads', express.static(UPLOAD_DIR));

// Criar report (agora com original_id garantido)
app.post('/reports', upload.single('photo'), async (req, res) => {
  try {
    // pega original_id do client se enviado; se não, gera um (Date.now())
    const originalId = req.body.originalId || req.body.original_id || Date.now();

    const { description, type, lat, lng, reporter, reporterId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Envie uma foto.' });

    const photoPath = `/uploads/${req.file.filename}`;

    const sql = `INSERT INTO reports
      (original_id, reporter, reporterId, description, type, photoPath, location_lat, location_lng)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      originalId,
      reporter ? String(reporter).trim() : 'Anônimo',
      reporterId ? String(reporterId) : null,
      description || '',
      type || 'outros',
      photoPath,
      lat ? parseFloat(lat) : null,
      lng ? parseFloat(lng) : null
    ];

    const [result] = await pool.execute(sql, params);
    const insertedId = result.insertId;

    // busca o record inserido pra retornar completo
    const [rows] = await pool.execute('SELECT * FROM reports WHERE id = ?', [insertedId]);
    const report = rows[0];

    return res.json({ ok: true, report });
  } catch (err) {
    // caso seja violação de chave única por original_id, retorna info amigável
    if (err && err.code === 'ER_DUP_ENTRY') {
      console.warn('Tentativa de inserir duplicate original_id, pulando:', err.message);
      return res.status(409).json({ error: 'Report já existe (original_id duplicado).' });
    }
    console.error('Erro POST /reports:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Listar reports — aceita ?ownerId=... e ?limit=... (opcional)
app.get('/reports', async (req, res) => {
  try {
    const { ownerId, limit } = req.query;
    let sql = 'SELECT * FROM reports';
    const params = [];
    if (ownerId) {
      sql += ' WHERE reporterId = ?';
      params.push(ownerId);
    }
    sql += ' ORDER BY createdAt DESC';
    if (limit) {
      sql += ' LIMIT ?';
      params.push(Number(limit));
    }

    const [rows] = await pool.execute(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error('Erro GET /reports:', err);
    return res.status(500).json({ error: err.message });
  }
});

// opcional: endpoint pra deletar reports (só do proprio reporter)
app.delete('/reports/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { ownerId } = req.query; // para garantir que só deleta seu próprio
    if (!ownerId) return res.status(400).json({ error: 'ownerId é necessário para deletar' });

    // primeiro busca o report
    const [rows] = await pool.execute('SELECT * FROM reports WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Report não existe' });

    const r = rows[0];
    if (String(r.reporterId) !== String(ownerId)) return res.status(403).json({ error: 'Não autorizado' });

    // remove imagem do disco
    try { fs.unlinkSync(path.join(__dirname, r.photoPath)); } catch(e){ /* ignore */ }

    // deleta do DB
    await pool.execute('DELETE FROM reports WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro DELETE /reports/:id', err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server rodando em http://0.0.0.0:${PORT}`));
