// Создаёт таблицу игры напрямую по SQL — drizzle-kit push ненадёжен в общей
// базе данных с другими приложениями (падает на интерактивном вопросе про
// переименование таблиц, т.к. видит "чужие" таблицы других игр).
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log('DATABASE_URL не задан — пропускаю миграцию.');
  process.exit(0);
}

const pool = new Pool({ connectionString: databaseUrl });

const statements = [
  `CREATE TABLE IF NOT EXISTS "games" (
    "code" text PRIMARY KEY,
    "state" jsonb NOT NULL,
    "version" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "last_seen_at" timestamp with time zone NOT NULL DEFAULT now()
  )`,
];

(async () => {
  for (const sql of statements) {
    await pool.query(sql);
  }
  await pool.end();
  console.log(`Миграция готова: проверено/создано таблиц — ${statements.length}.`);
})().catch((err) => {
  console.error('Миграция не удалась:', err);
  process.exit(1);
});
