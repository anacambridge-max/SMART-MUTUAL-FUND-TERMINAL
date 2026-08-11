ALTER TABLE IF EXISTS index_history ADD COLUMN IF NOT EXISTS trading_date date;
UPDATE index_history SET trading_date=(recorded_at AT TIME ZONE 'Asia/Kolkata')::date WHERE trading_date IS NULL;
ALTER TABLE index_history ALTER COLUMN trading_date SET NOT NULL;
DROP INDEX IF EXISTS index_history_name_recorded_unique;
CREATE UNIQUE INDEX IF NOT EXISTS index_history_name_trading_date_unique ON index_history(index_name,trading_date);
