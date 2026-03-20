-- Ensure both balance column naming styles exist and stay synchronized.
-- This lets frontend code read either:
--   balance_before / balance_after
--   before_balance / after_balance

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'balance_before'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN balance_before NUMERIC(12,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'balance_after'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN balance_after NUMERIC(12,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'before_balance'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN before_balance NUMERIC(12,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'after_balance'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN after_balance NUMERIC(12,2);
  END IF;
END $$;

-- Backfill existing rows in both directions so no history row is blank due to naming differences.
UPDATE public.transactions
SET
  balance_before = COALESCE(balance_before, before_balance),
  before_balance = COALESCE(before_balance, balance_before),
  balance_after  = COALESCE(balance_after, after_balance),
  after_balance  = COALESCE(after_balance, balance_after)
WHERE
  balance_before IS NULL
  OR before_balance IS NULL
  OR balance_after IS NULL
  OR after_balance IS NULL;

CREATE OR REPLACE FUNCTION public.sync_transaction_balance_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.balance_before := COALESCE(NEW.balance_before, NEW.before_balance);
  NEW.before_balance := COALESCE(NEW.before_balance, NEW.balance_before);

  NEW.balance_after := COALESCE(NEW.balance_after, NEW.after_balance);
  NEW.after_balance := COALESCE(NEW.after_balance, NEW.balance_after);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_transaction_balance_columns ON public.transactions;

CREATE TRIGGER trg_sync_transaction_balance_columns
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_transaction_balance_columns();
