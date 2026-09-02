update public.participants
set
  full_name = case full_name
    when 'G. Olbori' then 'Julissa Castro'
    when 'Ulisa Castro' then 'Kayal'
    when 'Kaya' then 'Ivis'
    else full_name
  end,
  business_name = case business_name
    when 'Olbori Studio' then 'VisuaLed'
    when 'Castro Creativa' then 'Creacom'
    when 'Kaya' then 'All in Construcción'
    else business_name
  end
where is_demo is true
  and (full_name, business_name) in (
    ('G. Olbori', 'Olbori Studio'),
    ('Ulisa Castro', 'Castro Creativa'),
    ('Kaya', 'Kaya')
  );
