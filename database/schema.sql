CREATE TABLE IF NOT EXISTS residents (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, block TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES residents(id),
 amount INTEGER NOT NULL CHECK(amount>0 AND amount%5000=0), paid_date TEXT NOT NULL,
 start_month TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 channel TEXT NOT NULL DEFAULT 'cash' CHECK(channel IN ('cash','DANA','OVO','GoPay','bank','other'))
);
CREATE TABLE IF NOT EXISTS cash_entries (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
 amount INTEGER NOT NULL CHECK(amount>0), date TEXT NOT NULL, description TEXT NOT NULL,
 channel TEXT NOT NULL DEFAULT 'cash' CHECK(channel IN ('cash','DANA','OVO','GoPay','bank','other'))
);
CREATE TABLE IF NOT EXISTS loans (
 id TEXT PRIMARY KEY, borrower TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
 date TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('cash','DANA','OVO','GoPay','bank','other')),
 note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS repayments (
 id TEXT PRIMARY KEY, loan_id TEXT NOT NULL REFERENCES loans(id),
 amount INTEGER NOT NULL CHECK(amount>0), date TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('cash','DANA','OVO','GoPay','bank','other'))
);
CREATE TABLE IF NOT EXISTS transfers (
 id TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount>0), date TEXT NOT NULL,
 from_channel TEXT NOT NULL CHECK(from_channel IN ('cash','DANA','OVO','GoPay','bank','other')),
 to_channel TEXT NOT NULL CHECK(to_channel IN ('cash','DANA','OVO','GoPay','bank','other')),
 note TEXT NOT NULL DEFAULT '', CHECK(from_channel<>to_channel)
);
CREATE INDEX IF NOT EXISTS payments_resident_date ON payments(resident_id,paid_date);
CREATE INDEX IF NOT EXISTS repayments_loan ON repayments(loan_id);
CREATE INDEX IF NOT EXISTS entries_date ON cash_entries(date);
