# Support contacts (t38)

`support_contacts.csv` is loaded by `sproutly-backend/app/scripts/import_contacts.py`, which the
deployed server runs at every start: any contact not yet in the table is added, and an admin's
later edits in the portal are kept.

Every number was read on 31 Oct 2026 from the organisation's own website (`source_url`), never
from directories, news articles or a named official's mobile. County agriculture departments
rarely publish their own line, so each county row is the county government's main line or
toll-free line, with "ask for Agriculture"; Kakamega is the only county whose agriculture
department publishes its own email. The Ministry of Agriculture and Livestock Development's
toll-free line is listed once as `Nationwide`, so every farmer sees it.

No usable phone number was published on 15 county websites when checked: Baringo, Garissa,
Kirinyaga, Migori and Nyeri (the site's security certificate was rejected), Busia (the address
did not resolve), Turkana (site suspended), Isiolo, Kilifi and Taita-Taveta (no contact details
readable), Marsabit (a message form only), and Kwale, Nyandarua, Tana River and Wajir (email or
emergency lines only). Farmers there see the Ministry's line; their county rows can be added in
the portal once a number is confirmed, for example by calling the county.
