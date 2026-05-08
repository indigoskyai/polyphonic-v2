SELECT cron.schedule(
  'luca-wander',
  '45 */3 * * *',
  $$SELECT invoke_edge_function('anima-wander')$$
);