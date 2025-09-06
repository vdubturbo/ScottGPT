-- Add date validation constraints to sources table
-- This script adds PostgreSQL constraints to ensure date integrity

-- Add validation constraint for reasonable date ranges
ALTER TABLE sources 
ADD CONSTRAINT valid_date_range_start
CHECK (
  date_start IS NULL OR 
  (date_start >= '1960-01-01' AND date_start <= CURRENT_DATE + INTERVAL '10 years')
);

ALTER TABLE sources 
ADD CONSTRAINT valid_date_range_end
CHECK (
  date_end IS NULL OR 
  (date_end >= '1960-01-01' AND date_end <= CURRENT_DATE + INTERVAL '10 years')
);

-- Add validation constraint for logical date ordering
ALTER TABLE sources 
ADD CONSTRAINT valid_date_order 
CHECK (
  date_start IS NULL OR 
  date_end IS NULL OR 
  date_start <= date_end
);

-- Add comment explaining the constraints
COMMENT ON CONSTRAINT valid_date_range_start ON sources IS 
'Ensures start dates are within reasonable career range (1960 to current date + 10 years)';

COMMENT ON CONSTRAINT valid_date_range_end ON sources IS 
'Ensures end dates are within reasonable career range (1960 to current date + 10 years)';

COMMENT ON CONSTRAINT valid_date_order ON sources IS 
'Ensures start date is not after end date when both are provided';

-- Show current constraints on the sources table
SELECT conname, contype, pg_get_constraintdef(oid) as definition 
FROM pg_constraint 
WHERE conrelid = 'sources'::regclass 
ORDER BY conname;