-- ============================================================
-- SEED V3 — Datos exactos del Excel (BD Points tab)
-- EJECUTAR DESPUÉS de migration_v3.sql
-- ============================================================

-- Limpiar datos anteriores
DELETE FROM claims;
DELETE FROM player_points;
DELETE FROM maze_sessions;
DELETE FROM players;

-- Sesión histórica base
INSERT INTO maze_sessions (id, maze_type, total_points, admin_points, event_points, participant_pts, session_date, notes)
VALUES ('00000000-0000-0000-0000-000000000001','BD',5,0,0,0,'2026-03-14','Importación histórica Excel 2026')
ON CONFLICT DO NOTHING;

-- Insertar TODOS los jugadores con total_score y available_pts del Excel
INSERT INTO players (name, owner, chars, total_score, available_pts, is_active) VALUES
  ('Morgan',         'Morgan',         'Prometeo, Baraka, Lilit, Mia, Jetzabel',            44.0802,   4.0802, TRUE),
  ('Alex',           'Alex',           'AlexGothico, Enid',                                120.7381,   0.7381, TRUE),
  ('Diego',          'Diego',          'Tokmat, Xplods (Champ)',                             83.9606,  18.9606, TRUE),
  ('Socrates',       'Socrates',       'Nael',                                              75.1666,  70.1666, TRUE),
  ('Jose (Jochero)', 'Jose (Jochero)', 'Prometeo, Baraka, Lilit, Mia, Jetzabel',            42.7396,   7.7396, TRUE),
  ('Kio',            'Kio',            'Kio, Maxima, New',                                  34.3816,   9.3816, TRUE),
  ('Marin10',        'Marin10',        'Marin10',                                           91.8246,  21.8246, TRUE),
  ('Miguel (Latina)','Miguel (Latina)','Nieves, Latina',                                   93.3014,   8.3014, TRUE),
  ('Luis',           'Luis',           'Linka, Global',                                    152.4782,  42.4782, TRUE),
  ('Neones',         'Neones',         'Thorkell, Neones, Maru, Ollie',                   112.6031,   2.6031, TRUE),
  ('Miguel (Muztan)','Miguel (Muztan)','SmallGD, Muztan',                                   49.4697,  14.4697, TRUE),
  ('Cronox',         'Cronox',         'Cronox',                                            22.0400,   2.0400, TRUE),
  ('Theermo',        'Theermo',        'Theermo',                                           26.3152,  26.3152, TRUE),
  ('Gaviria',        'Gaviria',        'Western, Ninja',                                   92.1354,  47.1354, TRUE),
  ('Panadero',       'Panadero',       'Panadero, Panadera',                                 8.5146,   8.5146, TRUE),
  ('Deux',           'Deux',           'Deux, Sanson',                                      10.7473,   5.7473, TRUE),
  ('Gokuult',        'Gokuult',        'Gokuult',                                           43.9235,   3.9235, TRUE),
  ('Ynder',          'Ynder',          'Corona',                                             0.4545,   0.4545, TRUE),
  ('Eduardo',        'Eduardo',        'Deux',                                              56.2481,  26.2481, TRUE),
  ('Tam',            'Tam',            'Volkren',                                            2.2129,   2.2129, TRUE),
  ('UlisesPat',      'UlisesPat',      'UlisesPat, Xplods, EvilGirl, Albanery, BigFood',  135.1163,  20.1163, TRUE),
  ('UltimateChamp',  'UltimateChamp',  'UltimateChamp, MariaProx',                         38.3433,   8.3433, TRUE),
  ('Inosuka',        'Inosuka',        'Inosuka',                                            0.2632,   0.2632, TRUE),
  ('Lucho',          'Lucho',          'Mia',                                                1.0096,   1.0096, TRUE),
  ('Stylegood',      'Stylegood',      'Stylegood',                                         29.2498,  14.2498, TRUE),
  ('Tyler',          'Tyler',          'Mistico, Onyz, Jochero',                            18.8304,   8.8304, TRUE),
  ('Victor',         'Victor',         'Mistico, Onyz, Angelous',                           20.6221,  20.6221, TRUE),
  ('Daniel Marin',   'Daniel Marin',   'Global',                                             3.8914,   3.8914, TRUE),
  ('Style21',        'Style21',        'Style21',                                            8.2365,   8.2365, TRUE),
  ('Maximo',         'Maximo',         'Maximo',                                             6.7404,   6.7404, TRUE),
  ('Note',           'Note',           'Note',                                               0.5000,   0.5000, TRUE),
  ('VictorHache',    'VictorHache',    'VictorHache',                                        0.5000,   0.5000, TRUE),
  ('Memo',           'Memo',           'MemoArk',                                           31.5608,   6.5608, TRUE),
  ('Legolas',        'Legolas',        'Legolas',                                            6.9408,   6.9408, TRUE),
  ('Joaquin',        'Joaquin',        'Joaquin',                                            0.8333,   0.8333, TRUE),
  ('B4D',            'B4D',            'B4D, TTTTT',                                        29.9536,   9.9536, TRUE),
  ('Maximo SS',      'Maximo SS',      'Maximo SS',                                          0.8333,   0.8333, TRUE),
  ('Joak',           'Joak',           'Joak',                                               5.6831,   5.6831, TRUE),
  ('BUKO',           'BUKO',           'BUKO',                                               7.5913,   7.5913, TRUE),
  ('Ahchong',        'Ahchong',        'Ahchong',                                            0.5556,   0.5556, TRUE),
  ('TECNO',          'TECNO',          'TECNO',                                              1.6667,   1.6667, TRUE),
  ('RORONOWA',       'RORONOWA',       'RORONOWA',                                           6.5615,   6.5615, TRUE),
  ('Vampire',        'Vampire',        'Vampire',                                            2.3494,   2.3494, TRUE),
  ('Dinamo',         'Dinamo',         'Dinamo',                                             0.4167,   0.4167, TRUE),
  ('Anthenea',       'Anthenea',       'Anthenea',                                           1.6725,   1.6725, TRUE),
  ('Jimbe',          'Jimbe',          'Jimbe',                                              1.2179,   1.2179, TRUE),
  -- Especiales
  ('Administrador',  'Administrador',  'Administrador',                                    232.1186, 132.1186, FALSE),
  ('Guild EVENTS',   'Guild EVENTS',   'Guild EVENTS',                                     258.4063, 148.4063, TRUE)
ON CONFLICT (name) DO UPDATE SET
  owner=EXCLUDED.owner, chars=EXCLUDED.chars,
  total_score=EXCLUDED.total_score, available_pts=EXCLUDED.available_pts;

-- Insertar player_points en sesión histórica (BD points = total_score)
INSERT INTO player_points (player_id, session_id, points)
SELECT p.id, '00000000-0000-0000-0000-000000000001', p.total_score
FROM players p
ON CONFLICT (player_id, session_id) DO UPDATE SET points=EXCLUDED.points;

-- Insertar claims históricos aprobados
WITH claims_data (owner_name, num_claims) AS (VALUES
  ('Morgan',20),('Alex',24),('Diego',13),('Socrates',1),
  ('Jose (Jochero)',7),('Kio',5),('Marin10',14),('Miguel (Latina)',17),
  ('Luis',22),('Neones',22),('Miguel (Muztan)',7),('Cronox',4),
  ('Gaviria',9),('Deux',1),('Gokuult',8),('Eduardo',6),
  ('UlisesPat',23),('UltimateChamp',6),('Stylegood',3),('Tyler',2),
  ('Memo',5),('B4D',4)
)
INSERT INTO claims (player_id, claimed_at, pts_used, notes, approved, approved_at)
SELECT p.id,'2026-03-14'::date,5,'Histórico Excel',TRUE,NOW()
FROM claims_data cd
JOIN players p ON p.name=cd.owner_name,
LATERAL generate_series(1,cd.num_claims);

SELECT 'Seed V3 completado: '||count(*)||' jugadores' AS resultado FROM players WHERE is_active=TRUE AND name NOT IN ('Administrador','Guild EVENTS');
