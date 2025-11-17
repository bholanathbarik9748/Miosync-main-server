-- Manual SQL script to fix whatsapp_message_tokens column names
-- Run this only if the automatic synchronization doesn't work

-- Check if the table exists and has the old column names
DO $$
BEGIN
    -- Rename createdAt to created_at if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'whatsapp_message_tokens' 
        AND column_name = 'createdAt'
    ) THEN
        ALTER TABLE "whatsapp_message_tokens" 
        RENAME COLUMN "createdAt" TO "created_at";
        RAISE NOTICE 'Column createdAt renamed to created_at';
    ELSE
        RAISE NOTICE 'Column createdAt does not exist, skipping...';
    END IF;

    -- Rename updatedAt to updated_at if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'whatsapp_message_tokens' 
        AND column_name = 'updatedAt'
    ) THEN
        ALTER TABLE "whatsapp_message_tokens" 
        RENAME COLUMN "updatedAt" TO "updated_at";
        RAISE NOTICE 'Column updatedAt renamed to updated_at';
    ELSE
        RAISE NOTICE 'Column updatedAt does not exist, skipping...';
    END IF;
END $$;

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'whatsapp_message_tokens'
ORDER BY ordinal_position;


