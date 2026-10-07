-- Dados iniciais. As tarifas são VALORES DE EXEMPLO: ajuste antes de lançar.

insert into public.specialties (id, name, category) values
  ('primeiros-socorros-infantil', 'Primeiros socorros infantis', 'baba'),
  ('recem-nascidos', 'Recém-nascidos', 'baba'),
  ('neurodivergentes', 'Crianças neurodivergentes', 'baba'),
  ('caes-grande-porte', 'Cães de grande porte', 'pet'),
  ('medicacao-pet', 'Medicação para pets', 'pet'),
  ('gatos', 'Gatos', 'pet'),
  ('medicamentos', 'Administração de medicamentos', 'idoso'),
  ('mobilidade-reduzida', 'Mobilidade reduzida', 'idoso'),
  ('tecnico-enfermagem', 'Técnico de enfermagem', 'idoso');

insert into public.pricing_rules (category, city, hourly_rate, daily_rate, minimum_hours, long_stay_days,
  long_stay_discount_bp, travel_base_fee, per_km_rate, night_surcharge_bp, weekend_surcharge_bp,
  holiday_surcharge_bp, extra_dependent_bp, specialty_surcharge_bp, platform_fee_bp) values
  ('baba',  'São Paulo', 3500, 25000, 3, 5, 1000, 800, 150, 2000, 1500, 5000, 2500, 1500, 1800),
  ('pet',   'São Paulo', 2500, 15000, 1, 5, 1000, 600, 150, 2000, 1000, 5000, 3000, 1500, 1800),
  ('idoso', 'São Paulo', 4000, 28000, 4, 5, 1000, 800, 150, 2000, 1500, 5000, 4000, 2500, 1800);

-- Feriados nacionais (adicione os municipais por cidade).
insert into public.holidays (day, name) values
  ('2026-10-12', 'Nossa Senhora Aparecida'), ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'), ('2026-11-20', 'Consciência Negra'),
  ('2026-12-25', 'Natal'), ('2027-01-01', 'Confraternização Universal'),
  ('2027-03-26', 'Sexta-feira Santa'), ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'), ('2027-09-07', 'Independência');
