-- =====================================================================
-- F1 Pit Wall Analyst: BigQuery + BigQuery ML
-- Runs in the free BigQuery sandbox (no credit card needed).
--
-- BEFORE YOU START
--   1. Create a dataset called  f1
--   2. Upload f1_results.csv   as table  f1.results    (Schema: Auto detect)
--   3. Upload f1_pit_stops.csv as table  f1.pit_stops  (Schema: Auto detect)
-- Then run each step below one at a time (select it, then click Run).
-- Sandbox tables expire after 60 days, so screenshot your results.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 1. 2026 standings (race + sprint points)
-- ---------------------------------------------------------------------
SELECT
  driver_name,
  ANY_VALUE(team_name HAVING MAX race_date) AS team,
  SUM(points + sprint_points)               AS points,
  COUNTIF(finish_position = 1)              AS wins,
  COUNTIF(finish_position <= 3)             AS podiums
FROM f1.results
WHERE year = 2026
GROUP BY driver_name
ORDER BY points DESC
LIMIT 10;


-- ---------------------------------------------------------------------
-- STEP 2. Team race-craft, 2025-2026: where they start vs where they finish
-- (positions gained = grid minus finish, classified finishes only)
-- ---------------------------------------------------------------------
WITH r AS (
  SELECT *, COALESCE(grid, COUNT(*) OVER (PARTITION BY race_id)) AS grid_pos  -- pit-lane starts go to the back
  FROM f1.results
  WHERE year >= 2025
)
SELECT
  team_name,
  COUNT(*)                                                    AS starts,
  ROUND(AVG(grid_pos), 1)                                     AS avg_grid,
  ROUND(AVG(finish_position), 1)                              AS avg_finish,
  ROUND(AVG(grid_pos - finish_position), 2)                   AS avg_positions_gained,  -- NULL (DNF) rows are skipped
  ROUND(COUNTIF(finish_position IS NULL) / COUNT(*) * 100, 1) AS dnf_rate_pct
FROM r
GROUP BY team_name
HAVING starts >= 20
ORDER BY avg_finish;


-- ---------------------------------------------------------------------
-- STEP 3. Pit-lane time by team, 2026 (median is robust to slow stops)
-- ---------------------------------------------------------------------
SELECT
  team_name,
  COUNT(*)                                                      AS stops,
  ROUND(APPROX_QUANTILES(pit_lane_ms, 100)[OFFSET(50)] / 1000, 2) AS median_seconds,
  ROUND(APPROX_QUANTILES(pit_lane_ms, 100)[OFFSET(90)] / 1000, 2) AS slow_stop_p90_seconds
FROM f1.pit_stops
WHERE year = 2026 AND pit_lane_ms IS NOT NULL
GROUP BY team_name
ORDER BY median_seconds;


-- ---------------------------------------------------------------------
-- STEP 4. How often does pole position win? (by season)
-- ---------------------------------------------------------------------
SELECT
  year,
  COUNT(*)                                             AS poles,
  ROUND(COUNTIF(finish_position = 1)  / COUNT(*) * 100) AS pole_win_pct,
  ROUND(COUNTIF(finish_position <= 3) / COUNT(*) * 100) AS pole_podium_pct
FROM f1.results
WHERE grid = 1
GROUP BY year
ORDER BY year;


-- ---------------------------------------------------------------------
-- STEP 5. Build model features. Only information known BEFORE the race:
--   log_grid       log of starting position (P1 vs P2 matters more than P15 vs P16)
--   quali_gap_pct  % slower than pole in qualifying (capped at 5%)
--   driver_form    driver's average points in his previous 3 races
--   team_form      team's average points per car in its previous 3 races
--   podium         the label: 1 if the driver finished in the top 3
-- ---------------------------------------------------------------------
CREATE OR REPLACE TABLE f1.features AS
WITH base AS (
  SELECT
    r.*,
    COALESCE(grid, COUNT(*) OVER (PARTITION BY race_id)) AS grid_pos,
    100 * (quali_best_ms / MIN(quali_best_ms) OVER (PARTITION BY race_id) - 1) AS raw_gap
  FROM f1.results AS r
),
team_race AS (
  SELECT team_id, race_id, race_date, SUM(points) / COUNT(*) AS pts_per_car
  FROM f1.results
  GROUP BY team_id, race_id, race_date
),
team_form AS (
  SELECT
    team_id, race_id,
    COALESCE(AVG(pts_per_car) OVER (PARTITION BY team_id ORDER BY race_date
             ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING), 0) AS team_form
  FROM team_race
)
SELECT
  b.race_id, b.year, b.round, b.race_date, b.grand_prix,
  b.driver_id, b.driver_code, b.team_id, b.grid_pos, b.finish_position,
  LN(b.grid_pos) AS log_grid,
  LEAST(COALESCE(b.raw_gap, MAX(b.raw_gap) OVER (PARTITION BY b.race_id), 5), 5) AS quali_gap_pct,
  COALESCE(AVG(b.points) OVER (PARTITION BY b.driver_id ORDER BY b.race_date
           ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING), 0) AS driver_form,
  t.team_form,
  IF(b.finish_position <= 3, 1, 0) AS podium
FROM base AS b
JOIN team_form AS t USING (team_id, race_id);


-- ---------------------------------------------------------------------
-- STEP 6. Train the model on 2018-2024 only (logistic regression)
-- ---------------------------------------------------------------------
CREATE OR REPLACE MODEL f1.podium_model
OPTIONS (
  model_type        = 'logistic_reg',
  input_label_cols  = ['podium'],
  data_split_method = 'NO_SPLIT'      -- we hold out 2025-2026 ourselves
) AS
SELECT log_grid, quali_gap_pct, driver_form, team_form, podium
FROM f1.features
WHERE year <= 2024;


-- ---------------------------------------------------------------------
-- STEP 7. Test on races the model has never seen (2025-2026)
-- ---------------------------------------------------------------------
SELECT *
FROM ML.EVALUATE(MODEL f1.podium_model,
  (SELECT log_grid, quali_gap_pct, driver_form, team_form, podium
   FROM f1.features WHERE year >= 2025));


-- ---------------------------------------------------------------------
-- STEP 8. The business test: in each race, pick the 3 most likely drivers.
-- How many real podium places did the model get, vs. "top 3 on the grid"?
-- ---------------------------------------------------------------------
WITH scored AS (
  SELECT
    race_id, podium, grid_pos,
    (SELECT p.prob FROM UNNEST(predicted_podium_probs) AS p WHERE p.label = 1) AS prob
  FROM ML.PREDICT(MODEL f1.podium_model,
    (SELECT * FROM f1.features WHERE year >= 2025))
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY race_id ORDER BY prob DESC)    AS model_rank,
    ROW_NUMBER() OVER (PARTITION BY race_id ORDER BY grid_pos ASC) AS grid_rank
  FROM scored
)
SELECT
  COUNT(DISTINCT race_id)                         AS races,
  COUNT(DISTINCT race_id) * 3                     AS podium_places,
  COUNTIF(model_rank <= 3 AND podium = 1)         AS model_correct,
  COUNTIF(grid_rank  <= 3 AND podium = 1)         AS grid_rule_correct
FROM ranked;


-- ---------------------------------------------------------------------
-- STEP 9. What the model learned (weights on standardised features)
-- ---------------------------------------------------------------------
SELECT processed_input AS feature, ROUND(weight, 3) AS weight
FROM ML.WEIGHTS(MODEL f1.podium_model, STRUCT(true AS standardize))
ORDER BY ABS(weight) DESC;
