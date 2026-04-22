create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  amount numeric(12, 2) not null check (amount > 0),
  message text,
  is_anonymous boolean not null default false,
  source text not null check (source in ('manual', 'paystack')),
  transaction_reference text unique,
  created_at timestamptz not null default now()
);

create index if not exists donations_created_at_idx on public.donations (created_at desc);
create index if not exists donations_source_idx on public.donations (source);

alter table public.donations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'donations'
      and policyname = 'allow public read donations'
  ) then
    create policy "allow public read donations"
      on public.donations
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;
