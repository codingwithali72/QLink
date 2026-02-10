-- Add rating and feedback columns to tokens table
-- This migration adds the necessary columns to store user feedback for ratings.

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'rating') THEN
        ALTER TABLE tokens ADD COLUMN rating INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'feedback') THEN
        ALTER TABLE tokens ADD COLUMN feedback TEXT;
    END IF;
END $$;
