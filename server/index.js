const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens (png/jpg/webp)'));
  }
});

const REPORTS_FILE = path.join(__dirname, 'reports.json');
function readReports(){
  try { return JSON.parse(fs.readFileSync(REPORTS_FILE)); }
  catch(e){ return []; }
}
function saveReports(arr){
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(arr, null, 2));
}

// Serve imagens
app.use('/uploads', express.static(UPLOAD_DIR));

// Endpoint que cria um report
app.post('/reports', upload.single('photo'), (req, res) => {
  try {
    const { description, type, lat, lng } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Envie uma foto.' });

    const report = {
      id: Date.now(),
      description: description || '',
      type: type || 'outros',
      photoPath: `/uploads/${req.file.filename}`,
      createdAt: new Date().toISOString(),
      location: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null
    };

    const reports = readReports();
    reports.unshift(report);
    saveReports(reports);

    return res.json({ ok: true, report });
  } catch(err){
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// Listar reports (simples)
app.get('/reports', (req, res) => {
  const reports = readReports();
  res.json(reports);
});

const PORT = 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server rodando em http://0.0.0.0:${PORT}`));
