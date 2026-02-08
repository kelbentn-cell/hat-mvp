create table if not exists tokens (
  id integer primary key autoincrement,
  token text unique,
  user_identifier text unique,
  certificate_number text unique,
  name text,
  order_id text unique not null,
  order_number text unique,
  email text,
  created_at text not null
);

create unique index if not exists idx_tokens_token on tokens(token);
create unique index if not exists idx_tokens_user_identifier on tokens(user_identifier);
create unique index if not exists idx_tokens_certificate_number on tokens(certificate_number);
create unique index if not exists idx_tokens_order on tokens(order_id);
create unique index if not exists idx_tokens_order_number on tokens(order_number);
