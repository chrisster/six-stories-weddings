-- Custom hero image for a gallery. When set, the public gallery hero uses this
-- uploaded image instead of the selected cover photo.
alter table public.galleries
  add column if not exists hero_image_path text;
