-- ICSI store: initial schema.
-- Migrations are additive and re-runnable: each file runs once, in a transaction, in name order.
-- Nothing here (or in any seed script) ever drops or truncates existing data.

-- ---------------------------------------------------------------- settings & features
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- A feature that needs an outside service (email, payments, Google, AI) can only be switched on after a real
-- test call succeeded. `fingerprint` ties the success to the configuration that was tested.
create table integration_status (
  key text primary key,
  verified_at timestamptz,
  fingerprint text,
  detail text
);

-- ---------------------------------------------------------------- staff accounts
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  password_hash text,
  role text not null check (role in ('owner', 'admin', 'staff')),
  must_change_password boolean not null default false,
  active boolean not null default true,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references admin_users (id) on delete set null
);
create unique index admin_users_email_key on admin_users (lower(email));

create table admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admin_users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip text,
  user_agent text
);
create index admin_sessions_admin_idx on admin_sessions (admin_id);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admin_users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- customer accounts (optional Google sign-in)
create table customers (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create index customers_email_idx on customers (lower(email));

create table customer_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index customer_sessions_customer_idx on customer_sessions (customer_id);

-- ---------------------------------------------------------------- media
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null unique,
  widths int[] not null default '{}',
  width int not null,
  height int not null,
  bytes bigint not null default 0,
  alt text not null default '',
  kind text not null default 'upload' check (kind in ('upload', 'banner', 'logo', 'mockup')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- catalogue
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  sort int not null default 0,
  show_on_home boolean not null default true,
  image_asset_id uuid references media_assets (id) on delete set null,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_description text not null default '',
  description_md text not null default '',
  instructions_md text not null default '',
  size_chart_md text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  price_cents int not null check (price_cents >= 0),
  sale_price_cents int check (sale_price_cents is null or (sale_price_cents >= 0 and sale_price_cents < price_cents)),
  sku text not null default '',
  tags text[] not null default '{}',
  featured boolean not null default false,
  track_inventory boolean not null default true,
  low_stock_threshold int check (low_stock_threshold is null or low_stock_threshold >= 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index products_status_idx on products (status, published_at desc);

create table product_categories (
  product_id uuid not null references products (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  primary key (product_id, category_id)
);
create index product_categories_category_idx on product_categories (category_id);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  asset_id uuid not null references media_assets (id) on delete restrict,
  alt text not null default '',
  color text not null default '',
  sort int not null default 0,
  is_primary boolean not null default false
);
create index product_images_product_idx on product_images (product_id, sort);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  sku text not null default '',
  size text not null default '',
  color text not null default '',
  price_cents int check (price_cents is null or price_cents >= 0),
  stock int not null default 0 check (stock >= 0),
  low_stock_threshold int check (low_stock_threshold is null or low_stock_threshold >= 0),
  active boolean not null default true,
  sort int not null default 0,
  unique (product_id, size, color)
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  starts_at timestamptz,
  ends_at timestamptz,
  featured boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table collection_products (
  collection_id uuid not null references collections (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  sort int not null default 0,
  primary key (collection_id, product_id)
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  kind text not null check (kind in ('percent', 'fixed')),
  value int not null check (value > 0),
  min_subtotal_cents int not null default 0 check (min_subtotal_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index promotions_code_key on promotions (upper(code));

-- ---------------------------------------------------------------- orders
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  mode text not null check (mode in ('request', 'online')),
  status text not null check (status in ('pending', 'awaiting_payment', 'confirmed', 'ready', 'completed', 'cancelled')),
  payment_status text not null default 'none' check (payment_status in ('none', 'pending', 'paid', 'failed', 'refunded', 'manual')),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  notes text not null default '',
  students jsonb not null default '[]' check (jsonb_typeof(students) = 'array' and jsonb_array_length(students) <= 5),
  fulfillment_id text not null default '',
  fulfillment_label text not null default '',
  fulfillment_fee_cents int not null default 0,
  promotion_code text,
  discount_cents int not null default 0,
  subtotal_cents int not null,
  total_cents int not null,
  stripe_session_id text unique,
  stripe_payment_intent text,
  customer_id uuid references customers (id) on delete set null,
  access_expires_at timestamptz not null,
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status_idx on orders (status, created_at desc);
create index orders_email_idx on orders (lower(customer_email));
create index orders_customer_idx on orders (customer_id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  variant_id uuid references product_variants (id) on delete set null,
  product_id uuid references products (id) on delete set null,
  product_name text not null,
  variant_label text not null default '',
  sku text not null default '',
  unit_price_cents int not null,
  quantity int not null check (quantity > 0),
  image_asset_id uuid references media_assets (id) on delete set null
);
create index order_items_order_idx on order_items (order_id);
create index order_items_variant_idx on order_items (variant_id);

create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  note text not null default '',
  actor_id uuid references admin_users (id) on delete set null,
  actor_label text not null default '',
  created_at timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id, created_at);

create table restock_requests (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants (id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'notified', 'unsubscribed')),
  verify_token_hash text not null unique,
  unsubscribe_token_hash text not null unique,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create unique index restock_requests_variant_email_key on restock_requests (variant_id, lower(email));

-- ---------------------------------------------------------------- website content
create table site_content (
  id text primary key default 'main',
  draft jsonb not null default '{}'::jsonb,
  published jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table pages (
  slug text primary key,
  title text not null,
  body_md text not null default '',
  approved boolean not null default false,
  updated_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_md text not null default '',
  tone text not null default 'info' check (tone in ('info', 'promo', 'important')),
  link_url text,
  link_label text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- plumbing
create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  text_body text not null,
  html_body text not null,
  template text not null default '',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  related_order_id uuid references orders (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_status_idx on email_outbox (status, created_at);

create table audit_log (
  id bigserial primary key,
  actor_id uuid references admin_users (id) on delete set null,
  actor_label text not null default '',
  action text not null,
  entity text not null default '',
  entity_id text not null default '',
  detail jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);

create table rate_limits (
  key text primary key,
  count int not null,
  window_start timestamptz not null
);

-- ---------------------------------------------------------------- defence in depth
-- The application connects as the table owner. Row level security is switched on with NO policies, so any
-- other database role (a read-only dashboard login, a leaked low-privilege credential) sees nothing.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
