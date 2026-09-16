import postgres from 'postgres';

let client;
let schemaPromise;

export function getClient() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!client) {
    client = postgres(url, {
      ssl: 'require',
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15
    });
  }
  return client;
}

export async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  const sql = getClient();
  schemaPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS dpk_exam_attempts (
        id UUID PRIMARY KEY,
        test_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        player_name_norm TEXT NOT NULL,
        static_id TEXT NOT NULL,
        discord_id TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        question_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        current_index INTEGER NOT NULL DEFAULT 0,
        question_order JSONB NOT NULL,
        option_orders JSONB NOT NULL,
        answers JSONB NOT NULL DEFAULT '{}'::jsonb,
        timed_out_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
        score INTEGER,
        total INTEGER,
        percent INTEGER,
        passed BOOLEAN
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_dpk_attempts_static_started ON dpk_exam_attempts(static_id, started_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_dpk_attempts_discord_started ON dpk_exam_attempts(discord_id, started_at DESC)`;
    // Earlier versions collected IP-related fields. Remove both the data and
    // supporting index when an existing database is upgraded.
    await sql`DROP INDEX IF EXISTS idx_dpk_attempts_iphash_started`;
    await sql`ALTER TABLE dpk_exam_attempts DROP COLUMN IF EXISTS ip_address`;
    await sql`ALTER TABLE dpk_exam_attempts DROP COLUMN IF EXISTS ip_hash`;
    await sql`ALTER TABLE dpk_exam_attempts DROP COLUMN IF EXISTS ip_changed`;
  })();
  return schemaPromise;
}

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function safeText(s, max = 180) {
  return String(s || '').replace(/[@`]/g, '').trim().slice(0, max);
}
