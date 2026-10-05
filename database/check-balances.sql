-- Run after schema + data import in Neon SQL Editor.
WITH movements AS (
 SELECT channel,amount AS delta FROM payments
 UNION ALL SELECT channel,CASE WHEN kind='income' THEN amount ELSE -amount END FROM cash_entries
 UNION ALL SELECT channel,-amount FROM loans
 UNION ALL SELECT channel,amount FROM repayments
 UNION ALL SELECT from_channel,-amount FROM transfers
 UNION ALL SELECT to_channel,amount FROM transfers
), wallets(channel) AS (VALUES ('cash'),('DANA'),('OVO'),('GoPay'),('bank'),('other'))
SELECT w.channel,COALESCE(SUM(m.delta),0) AS saldo FROM wallets w
LEFT JOIN movements m ON m.channel=w.channel GROUP BY w.channel ORDER BY w.channel;
SELECT 'residents' AS tabel,COUNT(*) FROM residents
UNION ALL SELECT 'payments',COUNT(*) FROM payments
UNION ALL SELECT 'cash_entries',COUNT(*) FROM cash_entries
UNION ALL SELECT 'loans',COUNT(*) FROM loans
UNION ALL SELECT 'repayments',COUNT(*) FROM repayments
UNION ALL SELECT 'transfers',COUNT(*) FROM transfers;
