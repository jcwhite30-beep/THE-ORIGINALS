-- ============================================================
-- SEED: 47 jugadores con puntos del PDF (14/03/2026)
-- Pega y ejecuta DESPUÉS de migration_v2.sql
-- ============================================================

-- Crear sesión base para los puntos históricos
INSERT INTO maze_sessions (id, maze_type, total_points, admin_points, event_points, participant_pts, session_date, notes)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'BD', 5, 0, 0, 0,
  '2026-03-14',
  'Importación histórica PDF 14-03-2026'
) ON CONFLICT DO NOTHING;

-- Insertar jugadores y sus puntos
WITH players_data (owner, chars, points, claims) AS (
  VALUES
    ('Guild EVENTS',   'Guild EVENTS',                                        140.97, 22),
    ('Morgan',         'Prometeo, Baraka, Lilit, Mia, Jetzabel',               4.08,  8),
    ('Alex',           'AlexGothico, Enid',                                   30.73, 18),
    ('Diego',          'Tokmat, Xplods (Champ)',                               17.79, 13),
    ('Socrates',       'Nael',                                                 69.25,  1),
    ('Jose (Jochero)', 'Prometeo, Baraka, Lilit, Mia, Jetzabel',               7.32,  7),
    ('Kio',            'Kio, Maxima, New',                                     8.43,  5),
    ('Marin10',        'Marin10',                                              17.32, 14),
    ('Miguel (Latina)','Nieves, Latina',                                       24.70, 13),
    ('Luis',           'Linka, Global',                                        37.88, 22),
    ('Neones',         'Thorkell, Neones, Maru, Ollie',                       15.39, 19),
    ('Miguel (Muztan)','SmallGD, Muztan',                                      13.35,  7),
    ('Cronox',         'Cronox',                                                2.04,  4),
    ('Theermo',        'Theermo',                                              23.76,  0),
    ('Gaviria',        'Western, Ninja',                                       45.59,  9),
    ('Panadero',       'Panadero, Panadera',                                    8.51,  0),
    ('Deux',           'Deux, Sanson',                                          5.74,  1),
    ('Gokuult',        'Gokuult',                                              12.08,  6),
    ('Ynder',          'Corona',                                                0.45,  0),
    ('Eduardo',        'Deux',                                                 26.25,  6),
    ('Tam',            'Volkren',                                               2.21,  0),
    ('UlisesPat',      'UlisesPat, Xplods, EvilGirl, Albanery, BigFood',      13.18, 23),
    ('UltimateChamp',  'UltimateChamp, MariaProx',                             7.47,  6),
    ('Inosuka',        'Inosuka',                                               0.26,  0),
    ('Lucho',          'Mia',                                                   1.01,  0),
    ('Stylegood',      'Stylegood',                                            13.62,  3),
    ('Tyler',          'Mistico, Onyz, Jochero',                               7.96,  2),
    ('Victor',         'Mistico, Onyz, Angelous',                             20.62,  0),
    ('Daniel',         'Marin Global',                                          3.89,  0),
    ('Style21',        'Style21',                                               7.62,  0),
    ('Maximo',         'Maximo',                                                6.74,  0),
    ('Note',           'Note',                                                  0.50,  0),
    ('VictorHache',    'VictorHache',                                           0.50,  0),
    ('Memo',           'MemoArk',                                               4.90,  5),
    ('Legolas',        'Legolas',                                               6.49,  0),
    ('Joaquin',        'Joaquin',                                               0.83,  0),
    ('B4D',            'B4D, TTTTT',                                            4.57,  4),
    ('Maximo SS',      'Maximo SS',                                             0.83,  0),
    ('Joak',           'Joak',                                                  4.77,  0),
    ('Boko',           'Boko',                                                  6.22,  0),
    ('Ahchong',        'Ahchong',                                               0.56,  0),
    ('TECNO',          'xxxREYxxx',                                             1.67,  0),
    ('RORONOWA',       'RORONOWA',                                              6.56,  0),
    ('Vampire',        'Vampire',                                               2.35,  0),
    ('Dinamo',         'Dinamo',                                                0.42,  0),
    ('Anthenea',       'Anthenea',                                              1.67,  0),
    ('Jimbe',          'Jimbe',                                                 1.22,  0)
)
INSERT INTO players (name, owner, chars, is_active)
SELECT owner, owner, chars, TRUE
FROM players_data
ON CONFLICT (name) DO UPDATE
  SET chars  = EXCLUDED.chars,
      owner  = EXCLUDED.owner;

-- Insertar puntos (usando sesión histórica)
WITH players_data (owner, points) AS (
  VALUES
    ('Guild EVENTS',   140.97), ('Morgan',          4.08), ('Alex',           30.73),
    ('Diego',           17.79), ('Socrates',        69.25), ('Jose (Jochero)',  7.32),
    ('Kio',              8.43), ('Marin10',         17.32), ('Miguel (Latina)', 24.70),
    ('Luis',            37.88), ('Neones',          15.39), ('Miguel (Muztan)', 13.35),
    ('Cronox',           2.04), ('Theermo',         23.76), ('Gaviria',        45.59),
    ('Panadero',         8.51), ('Deux',             5.74), ('Gokuult',        12.08),
    ('Ynder',            0.45), ('Eduardo',         26.25), ('Tam',             2.21),
    ('UlisesPat',       13.18), ('UltimateChamp',   7.47), ('Inosuka',         0.26),
    ('Lucho',            1.01), ('Stylegood',       13.62), ('Tyler',           7.96),
    ('Victor',          20.62), ('Daniel',           3.89), ('Style21',         7.62),
    ('Maximo',           6.74), ('Note',             0.50), ('VictorHache',     0.50),
    ('Memo',             4.90), ('Legolas',          6.49), ('Joaquin',         0.83),
    ('B4D',              4.57), ('Maximo SS',        0.83), ('Joak',            4.77),
    ('Boko',             6.22), ('Ahchong',          0.56), ('TECNO',           1.67),
    ('RORONOWA',         6.56), ('Vampire',          2.35), ('Dinamo',          0.42),
    ('Anthenea',         1.67), ('Jimbe',            1.22)
)
INSERT INTO player_points (player_id, session_id, points)
SELECT p.id, '00000000-0000-0000-0000-000000000001', pd.points
FROM players_data pd
JOIN players p ON p.name = pd.owner
ON CONFLICT (player_id, session_id) DO UPDATE SET points = EXCLUDED.points;

-- Insertar claims históricos
WITH claims_data (owner, num_claims) AS (
  VALUES
    ('Morgan', 8), ('Alex', 18), ('Diego', 13), ('Socrates', 1),
    ('Jose (Jochero)', 7), ('Kio', 5), ('Marin10', 14), ('Miguel (Latina)', 13),
    ('Luis', 22), ('Neones', 19), ('Miguel (Muztan)', 7), ('Cronox', 4),
    ('Gaviria', 9), ('Deux', 1), ('Gokuult', 6), ('Eduardo', 6),
    ('UlisesPat', 23), ('UltimateChamp', 6), ('Stylegood', 3), ('Tyler', 2),
    ('Memo', 5), ('B4D', 4), ('Guild EVENTS', 22)
)
INSERT INTO claims (player_id, claimed_at, notes, approved)
SELECT
  p.id,
  '2026-03-14'::date,
  'Importación histórica',
  TRUE
FROM claims_data cd
JOIN players p ON p.name = cd.owner,
LATERAL generate_series(1, cd.num_claims)
ON CONFLICT DO NOTHING;

SELECT 'Seed completado: ' || count(*) || ' jugadores' FROM players;
