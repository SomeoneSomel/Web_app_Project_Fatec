// server/sync.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const REPORTS_FILE = path.join(__dirname, 'reports.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

async function main(){
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5000, //im using port 5000, but u can change it
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '{whoever is reading this code, use your own password here, i removed mine for security reasons}',
    database: process.env.DB_NAME || 'cidade_perfeita',
    waitForConnections: true,
    connectionLimit: 5
  });

  if (!fs.existsSync(REPORTS_FILE)) {
    console.log('reports.json não existe — nada a sincronizar.');
    process.exit(0);
  }

  const raw = fs.readFileSync(REPORTS_FILE, 'utf8');
  let reports = [];
  try { reports = JSON.parse(raw); } catch(e){ console.error('Erro parse reports.json:', e); process.exit(1); }

  for (const r of reports) {
    // usa r.id como original_id
    const originalId = r.id || null;
    if (!originalId) {
      console.log('Report sem id original, pulando:', r);
      continue;
    }

    // verifica se já existe no DB
    const [exists] = await pool.execute('SELECT id FROM reports WHERE original_id = ?', [originalId]);
    if (exists.length > 0) {
      console.log(`Já sincronizado original_id=${originalId}, pulando.`);
      continue;
    }

    // garante que a imagem ainda exista
    const photoRel = r.photoPath || r.photo || '';
    const photoFilePath = path.join(__dirname, photoRel.replace(/^\//, '')); // remove leading slash
    if (!fs.existsSync(photoFilePath)) {
      console.warn(`Imagem não encontrada para original_id=${originalId}: ${photoFilePath}. Pulando.`);
      continue;
    }

    // prepara valores
    const reporter = r.reporter || 'Anônimo';
    const reporterId = r.reporterId || null;
    const description = r.description || '';
    const type = r.type || 'outros';
    const photoPath = photoRel; // grava o mesmo path relativo que o server usa (/uploads/xxx.jpg)
    const lat = r.location && r.location.lat ? Number(r.location.lat) : null;
    const lng = r.location && r.location.lng ? Number(r.location.lng) : null;
    const createdAt = r.createdAt ? new Date(r.createdAt) : new Date();

    try {
      const sql = `INSERT INTO reports
        (original_id, reporter, reporterId, description, type, photoPath, location_lat, location_lng, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [originalId, reporter, reporterId, description, type, photoPath, lat, lng, createdAt];
      const [res] = await pool.execute(sql, params);
      console.log(`Sincronizado original_id=${originalId} -> insertId=${res.insertId}`);
    } catch (err) {
      console.error('Erro inserindo original_id=', originalId, err);
    }
  }

  await pool.end();
  console.log('Sincronização finalizada.');
}

main().catch(err => {
  console.error('Erro geral no sync:', err);
  process.exit(1);
});
