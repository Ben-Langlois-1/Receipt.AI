export const TRANSACTIONS_SQL = `CREATE TABLE IF NOT EXISTS transactions (
  external_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  posted_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  direction TEXT NOT NULL,
  category TEXT NOT NULL,
  category_source TEXT NOT NULL,
  account TEXT NOT NULL DEFAULT '',
  source_bank TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
`
