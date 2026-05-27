-- 3-hourly WhatsApp site-status summary to the management group.
-- The Postgres pg_cron job + the recipient group JID were created via MCP.
insert into public.app_settings (key, value, description)
values ('summary_group_jid', '120363424096179114@g.us',
        'WhatsApp group JID where the 3-hour site summary goes')
on conflict (key) do update set value = excluded.value;
