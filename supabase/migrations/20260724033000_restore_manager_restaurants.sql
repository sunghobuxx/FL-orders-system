create table if not exists public.manager_restaurants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint manager_restaurants_user_restaurant_key unique (user_id, restaurant_id)
);

create index if not exists manager_restaurants_user_id_idx
  on public.manager_restaurants (user_id);

create index if not exists manager_restaurants_restaurant_id_idx
  on public.manager_restaurants (restaurant_id);

alter table public.manager_restaurants enable row level security;

insert into public.manager_restaurants (user_id, restaurant_id)
values
  ('72741e9d-034b-424c-a516-5eec273f89f7', '80555fd6-f090-463a-acdd-7d987e19892e'),
  ('72741e9d-034b-424c-a516-5eec273f89f7', '815bad34-e73b-42de-b049-20b2f5af8450'),
  ('72741e9d-034b-424c-a516-5eec273f89f7', '746e8744-5ae6-4b91-89ed-e8024a59fb6d'),
  ('72741e9d-034b-424c-a516-5eec273f89f7', 'eceaad9e-8e2e-48be-8a1d-e14bdbdb4f7e'),
  ('72741e9d-034b-424c-a516-5eec273f89f7', 'e0e5082f-533e-4419-8963-6e9339305bf6'),
  ('72741e9d-034b-424c-a516-5eec273f89f7', 'a97506e7-357e-48b2-b894-45fe26e1033f'),
  ('72741e9d-034b-424c-a516-5eec273f89f7', '4f3dd4a2-16ff-4ae3-bfb6-db47d010c3f0'),
  ('72741e9d-034b-424c-a516-5eec273f89f7', 'ea9a6905-080b-44f4-9af9-88e6e370630b'),
  ('72741e9d-034b-424c-a516-5eec273f89f7', '03072c0d-3b10-48f8-909a-5a5677124233'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '602f4b87-3ca9-4cbe-b45c-5536186f5649'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', 'f0d4a035-3e25-4719-946b-e15fed866154'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', 'e7be4ddf-5cda-4378-a120-89012a0afed5'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '8a65d28d-48b1-4bc2-b1e4-7a2c7450c439'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '13175191-dbb1-4647-bb8a-0ece045c8d7b'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '7d40d9e3-9833-48bd-abcd-bc3c9acd5ff4'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '06d64b75-ec2d-492a-aad0-3870e4a82e4c'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', 'bca593db-7b36-4180-baba-628d36bea726'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '04f77002-10da-4814-842e-f88c334d3dc6'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '1301d09e-4af1-45f1-9778-002ca4ad7cb3'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '5ac0e1f5-9516-4f70-85c0-29e2fc155ba1'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '136d4983-f9eb-4db1-9af5-3835a3a32db7'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '9abaad64-e748-42f6-8a8d-577b2441edbf'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '65e8a03c-f964-4add-a07b-3142e070b4d4'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '97b550c5-df27-423b-b4ab-f8cd284e9c95'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '0bf3fc53-379e-4235-9ecf-d5945a57d66f'),
  ('cd338b63-ea47-4bca-afb9-754cb1f688d0', '8b3a9223-69c0-499a-b09a-e7914211547a')
on conflict (user_id, restaurant_id) do nothing;
