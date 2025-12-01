// server/clean_db.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ARCHIVE_DIR = path.join(__dirname, 'uploads-archive');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    yes: args.includes('--yes'),
    archive: args.includes('--archive'),
    deleteFiles: args.includes('--delete-files'),
  };
}

async function main(){
  const opts = parseArgs();
  console.log('Opções:', opts);

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5000, //im using port 5000, but u can change it
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '{whoever is reading this code, use your own password here, i removed mine for security reasons}',
    database: process.env.DB_NAME || 'cidade_perfeita',
    waitForConnections: true,
    connectionLimit: 5
  });

  try {
    // conta quantos reports tem
    const [countRows] = await pool.execute('SELECT COUNT(*) as cnt FROM reports');
    const total = countRows[0] ? countRows[0].cnt : 0;
    console.log(`Total de reports na tabela: ${total}`);

    if (total === 0) {
      console.log('Nada a apagar. Saindo.');
      await pool.end();
      return;
    }

    // pega lista de arquivos relacionados (photoPath)
    const [rows] = await pool.execute('SELECT id, photoPath FROM reports');
    const files = rows.map(r => ({ id: r.id, photoPath: r.photoPath }));

    console.log(`Exemplo (primeiros 5) de photoPath que seriam afetados:`);
    files.slice(0,5).forEach(f => console.log(`  id=${f.id} -> ${f.photoPath}`));

    if (opts.dryRun) {
      console.log('DRY RUN ativado — nenhuma alteração será feita.');
      await pool.end();
      return;
    }

    if (!opts.yes) {
      console.log('Você não passou --yes. Se realmente quer apagar, rode com --yes.');
      await pool.end();
      return;
    }

    // antes de apagar, se archive -> cria pasta
    if (opts.archive) {
      if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
      console.log(`Arquivos serão movidos para: ${ARCHIVE_DIR}`);
    }

    // inicia transação
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // apagando registros
      const [delRes] = await conn.execute('DELETE FROM reports');
      console.log(`Registros removidos: ${delRes.affectedRows}`);

      // commit DB
      await conn.commit();
      console.log('Transação commitada (dados do DB apagados).');
    } catch (errTx) {
      await conn.rollback();
      throw errTx;
    } finally {
      conn.release();
    }

    // agora lida com arquivos no disco (fora da transação)
    for (const f of files) {
      if (!f.photoPath) continue;
      // photoPath geralmente começa com /uploads/xxx.jpg
      const rel = f.photoPath.replace(/^\/+/, '');
      const abs = path.join(__dirname, rel);
      if (!fs.existsSync(abs)) {
        // já pode ter sido removido antes
        // console.log('Arquivo não existe, pulando:', abs);
        continue;
      }

      if (opts.archive) {
        const dest = path.join(ARCHIVE_DIR, path.basename(abs));
        try {
          fs.renameSync(abs, dest);
          console.log(`Movido ${abs} -> ${dest}`);
        } catch (e) {
          console.warn('Falha ao mover arquivo, tentando copiar e apagar:', abs, e.message);
          try {
            fs.copyFileSync(abs, dest);
            fs.unlinkSync(abs);
            console.log(`Copiado+removido ${abs} -> ${dest}`);
          } catch (e2) {
            console.error('Erro ao mover/copy file:', e2.message);
          }
        }
      } else if (opts.deleteFiles) {
        try {
          fs.unlinkSync(abs);
          console.log(`Deletado arquivo: ${abs}`);
        } catch (e) {
          console.error('Erro ao deletar arquivo:', abs, e.message);
        }
      } else {
        // nem archive nem delete -> deixa os arquivos onde estão (apenas dados DB deletados)
      }
    }

    console.log('Operação finalizada.');
    await pool.end();
  } catch (err) {
    console.error('Erro no processo:', err);
    try { await pool.end(); } catch(e){}
    process.exit(1);
  }
}

main();
