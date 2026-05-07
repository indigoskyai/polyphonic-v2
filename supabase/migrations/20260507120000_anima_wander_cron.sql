-- =============================================================================
-- anima-wander cron schedule + Mind stream wire-up
--
-- anima-wander generates wanderings (and occasionally crystallized insights)
-- during waking hours. Companion to anima-think (heartbeat-driven structured
-- thoughts) and anima-dream (quiet-hours free association). Fills the
-- previously-empty Wanderings and Insights streams in the Mind UI.
-- =============================================================================

-- Wandering — every 3 hours, offset from existing crons so we don't overlap.
-- (mnemos-decay runs at :15, journal-cron at :00, heartbeat at :30, mnemos-
-- consolidate at :00 every 6h. Wander goes at :45.)
SELECT cron.schedule(
  'luca-wander',
  '45 */3 * * *',
  $$SELECT invoke_edge_function('anima-wander')$$
);
