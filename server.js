// ─────────────────────────────────────────────────────────────
//  Carrega variáveis de ambiente do arquivo .env (uso local)
//  Na nuvem (Railway), as variáveis são configuradas no painel.
// ─────────────────────────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const path    = require('path');
const bcrypt  = require('bcrypt');
const app     = express();

const SALT_ROUNDS = 12; // custo do hash — maior = mais seguro, mais lento

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────
//  BANCO DE DADOS
//  Se DATABASE_URL estiver definida → usa PostgreSQL (nuvem)
//  Caso contrário               → usa SQLite (local)
// ─────────────────────────────────────────────────────────────

let db; // interface unificada: db.query(sql, params) → Promise<rows>

if (process.env.DATABASE_URL) {
  // ── PostgreSQL ────────────────────────────────────────────
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  db = {
    query: (sql, params = []) => pool.query(sql, params).then(r => r.rows),
    run:   (sql, params = []) => pool.query(sql, params).then(r => r),
  };

  // Cria tabelas no PostgreSQL (placeholders são $1, $2 ...)
  pool.query(`
    CREATE TABLE IF NOT EXISTS socios (
      id         SERIAL PRIMARY KEY,
      matricula  TEXT,
      nome       TEXT,
      dados_json TEXT
    )
  `).then(() => console.log('✅ Tabela socios OK (PostgreSQL)'))
    .catch(e => console.error('Erro ao criar tabela socios:', e.message));

  pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id            SERIAL PRIMARY KEY,
      usuario       TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      criado_em     TEXT
    )
  `).then(() => console.log('✅ Tabela usuarios OK (PostgreSQL)'))
    .catch(e => console.error('Erro ao criar tabela usuarios:', e.message));

  console.log('🐘 Usando PostgreSQL');

} else {
  // ── SQLite (desenvolvimento local) ────────────────────────
  const sqlite3 = require('sqlite3').verbose();
  const sqliteDb = new sqlite3.Database('./clube.db', err => {
    if (err) console.error(err.message);
    else console.log('✅ Banco de dados SQLite conectado.');
  });

  // Adapta a interface para ser igual à do PostgreSQL
  db = {
    query: (sql, params = []) => new Promise((resolve, reject) => {
      // Converte placeholders $1,$2 → ? para o SQLite
      const sqlLite = sql.replace(/\$\d+/g, '?');
      sqliteDb.all(sqlLite, params, (err, rows) => {
        if (err) reject(err); else resolve(rows || []);
      });
    }),
    run: (sql, params = []) => new Promise((resolve, reject) => {
      const sqlLite = sql.replace(/\$\d+/g, '?');
      sqliteDb.run(sqlLite, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    }),
  };

  // Cria tabelas no SQLite
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS socios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula  TEXT,
    nome       TEXT,
    dados_json TEXT
  )`, err => { if (err) console.error('Erro socios:', err.message); });

  sqliteDb.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario       TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    criado_em     TEXT
  )`, err => { if (err) console.error('Erro usuarios:', err.message); });

  console.log('🗄️  Usando SQLite (local)');
}

// ─────────────────────────────────────────────────────────────
//  HELPER
// ─────────────────────────────────────────────────────────────
function rowToSocio(row) {
  try {
    const obj = JSON.parse(row.dados_json || '{}');
    obj.id = row.id;
    return obj;
  } catch (e) {
    return { id: row.id, matricula: row.matricula, nome: row.nome };
  }
}

// ─────────────────────────────────────────────────────────────
//  ROTAS — SÓCIOS
// ─────────────────────────────────────────────────────────────

// 1. Buscar todos
app.get('/api/socios', async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT * FROM socios ORDER BY CAST(matricula AS INTEGER)`
    );
    res.json(rows.map(rowToSocio));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2. Buscar por ID
app.get('/api/socios/:id', async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT * FROM socios WHERE id = $1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sócio não encontrado.' });
    res.json(rowToSocio(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Criar novo sócio
app.post('/api/socios', async (req, res) => {
  try {
    const socio = req.body;
    const dados_json = JSON.stringify(socio);

    let id;
    if (process.env.DATABASE_URL) {
      // PostgreSQL: usa RETURNING para pegar o ID gerado
      const rows = await db.query(
        `INSERT INTO socios (matricula, nome, dados_json) VALUES ($1, $2, $3) RETURNING id`,
        [socio.matricula, socio.nome, dados_json]
      );
      id = rows[0].id;
    } else {
      // SQLite
      const result = await db.run(
        `INSERT INTO socios (matricula, nome, dados_json) VALUES ($1, $2, $3)`,
        [socio.matricula, socio.nome, dados_json]
      );
      id = result.lastID;
    }

    // Atualiza o JSON com o id real
    socio.id = id;
    await db.run(
      `UPDATE socios SET dados_json = $1 WHERE id = $2`,
      [JSON.stringify(socio), id]
    );

    res.status(201).json(socio);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Atualizar sócio
app.put('/api/socios/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const socio = req.body;
    socio.id = id;
    const dados_json = JSON.stringify(socio);

    const result = await db.run(
      `UPDATE socios SET matricula = $1, nome = $2, dados_json = $3 WHERE id = $4`,
      [socio.matricula, socio.nome, dados_json, id]
    );

    // PostgreSQL retorna rowCount, SQLite retorna changes
    const changed = result.rowCount ?? result.changes;
    if (changed === 0) return res.status(404).json({ error: 'Sócio não encontrado.' });

    res.json(socio);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 5. Deletar sócio
app.delete('/api/socios/:id', async (req, res) => {
  try {
    const result = await db.run(
      `DELETE FROM socios WHERE id = $1`, [req.params.id]
    );
    const changed = result.rowCount ?? result.changes;
    if (changed === 0) return res.status(404).json({ error: 'Sócio não encontrado.' });
    res.json({ message: 'Sócio deletado com sucesso.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  ROTAS — AUTENTICAÇÃO
// ─────────────────────────────────────────────────────────────

// Registrar usuário
app.post('/api/usuarios', async (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha)
    return res.status(400).json({ error: 'Dados incompletos.' });
  try {
    // Gera hash bcrypt com salt único por usuário
    const hash = await bcrypt.hash(senha, SALT_ROUNDS);
    await db.run(
      `INSERT INTO usuarios (usuario, password_hash, criado_em) VALUES ($1, $2, $3)`,
      [usuario, hash, new Date().toISOString()]
    );
    res.status(201).json({ ok: true, usuario });
  } catch (e) {
    if (e.message.includes('UNIQUE') || e.message.includes('unique'))
      return res.status(409).json({ error: 'Este usuário já existe.' });
    res.status(500).json({ error: e.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha)
    return res.status(400).json({ error: 'Dados incompletos.' });
  try {
    const rows = await db.query(
      `SELECT * FROM usuarios WHERE usuario = $1`, [usuario]
    );
    if (!rows.length)
      return res.status(401).json({ error: 'Usuário não encontrado. Crie uma conta primeiro.' });
    // bcrypt.compare compara a senha com o hash armazenado
    const ok = await bcrypt.compare(senha, rows[0].password_hash);
    if (!ok)
      return res.status(401).json({ error: 'Senha incorreta.' });
    res.json({ ok: true, usuario: rows[0].usuario });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
