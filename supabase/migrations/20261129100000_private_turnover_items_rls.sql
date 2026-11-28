-- Defense in depth on an internal table; existing privileged functions retain access.
alter table private.play80_turnover_items enable row level security;
