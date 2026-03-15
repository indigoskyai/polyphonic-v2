ALTER TABLE user_settings
  ADD COLUMN memory_enabled boolean DEFAULT true,
  ADD COLUMN chat_history_enabled boolean DEFAULT true;