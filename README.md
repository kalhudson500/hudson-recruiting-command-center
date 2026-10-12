# Hudson Recruiting Command Center

A private, responsive NCAA football recruiting CRM, built with **Node.js 22.13+ built-in modules** and SQLite. No npm packages required. Includes login, college program directory (FBS/FCS/D2/D3), coaches, public-source candidate extraction and manual verification, individual/selected-group email drafts, approval-gated sending, and recruiting tracker.

## Local installation

1. Install Node.js **22.13 or newer**.
2. Unzip the project. Open a terminal inside the `hudson-command-center` directory.
3. Start it with a long initial admin password:

   macOS/Linux:
   ```bash
   ADMIN_PASSWORD='replace-this-with-a-long-unique-password' npm start
   ```
   Windows PowerShell:
   ```powershell
   $env:ADMIN_PASSWORD='replace-this-with-a-long-unique-password'; npm start
   ```
4. Open **http://127.0.0.1:3000** and log in as `admin` using that password. The first startup stores a salted scrypt hash in the SQLite database. You do not need to supply `ADMIN_PASSWORD` again unless creating a new database.
5. Back up `data/hudson.sqlite` securely. Do not share this file.

**IMPORTANT:** Localhost is available only on the machine running the server. To use it on both iPhone and computer, deploy it on a private HTTPS host with persistent storage, or access it through a private VPN such as Tailscale. Do not expose the local HTTP service to the public Internet.

## Secure deployment checklist

- Run behind a reverse proxy or managed host with HTTPS and a valid certificate.
- Set `COOKIE_SECURE=true` and ensure your HTTPS proxy forwards to the Node server on loopback (`HOST=127.0.0.1`).
- Restrict access using a private VPN / identity-aware proxy, ideally with MFA. App password is an additional layer.
- Use persistent encrypted disk/storage for the `DATA_DIR` SQLite database, keep secrets in host environment variables, enable backups, monitoring, and OS updates.
- Keep the service single-instance (SQLite, in-process send lock); do not run multiple replicas or workers without adding a durable job queue and DB coordination.
- Do not publish the SQLite database, `.env`, or secrets. This starter has no password-reset flow, account management, or rate limiting; put rate limiting and authentication protections at the reverse proxy.

## Email sending setup

1. Purchase/control a dedicated sending domain or subdomain and create an address such as `recruiting@yourdomain.com`.
2. Set up a transactional email provider (this implementation uses **Resend**). Verify domain ownership and configure SPF/DKIM and preferably DMARC following provider instructions.
3. Configure `RESEND_API_KEY` and `RECRUITING_FROM_EMAIL` environment variables before starting the server.
4. Add schools and coaches. A coach must have a valid email, an official source URL, and be manually marked `verified` before the app permits sending.
5. In **Email Campaigns**, select recipients, save a draft, open **Review / Send**, approve, and click **Send Next Batch**. The system sends separate messages, up to 25 per click, with a short delay. Approval does not automatically send.
6. Monitor your provider's limits and complaint rates. Handle unsubscribe replies manually by marking the coach opted out or adding the address to the `suppression` table (API `/api/suppression`). Never send to contacts who opted out. Provider webhook automation is **not** included.

**Compliance:** Send relevant, respectful, low-volume recruiting messages. Respect provider anti-spam rules, applicable law (including CAN-SPAM when applicable), and school policies. The app does not circumvent social platform restrictions, scrape private accounts, or send unsolicited social DMs. Do not use mass emailing to bypass limits.

## Populating the NCAA school database

The app deliberately ships with **zero invented schools/coaches**. NCAA school affiliations and coaching rosters change. Start by obtaining current official school membership lists and football staff directory URLs, then import schools through **Schools > Import schools from JSON**. JSON example:

```json
[
  {"name":"Example University","division":"FBS","conference":"Example Conference","state":"CA","staff_url":"https://example.edu/sports/football/coaches"},
  {"name":"Sample College","division":"D3","state":"NY"}
]
```

The example records above are illustrative only, not real programs. Divisions are `FBS`, `FCS`, `D2`, `D3`. The public directory collector only accepts HTTPS and does not follow redirects. It attempts to extract visible emails and social links from an HTML page. This is a **review queue**, not verified identity resolution; manual association to named coaches and checking the official source is required. Some school websites use JavaScript, block automation, or disallow scraping; use manual entry or authorized exports for those sites. Respect robots.txt and site terms before collecting.

## Project files

- `server.js` — HTTP server, SQLite schema, auth, API, public-contact candidate collection, approval-gated Resend sending.
- `public/index.html` — web app shell and login.
- `public/app.js` — interactive dashboard, directories, campaigns, verification, and tracker.
- `public/styles.css` — responsive mobile/desktop layout.
- `.env.example` — example environment settings (not automatically loaded; export variables in shell/hosting settings).
- `data/` — private SQLite data folder.

## Limitations and next production steps

This is a functional **starter MVP**, not a completed nationwide contact database or fully hardened SaaS. It has no live NCAA directory sync, no background crawling, no authenticated X/Instagram APIs, no automated email reply sync, no bounce webhooks, no bulk retry controls, and no multi-user support. For a production deployment, add request rate limiting, secure password recovery/MFA, webhook-driven suppression, audited contact provenance, source-specific collectors with robots/terms checks, scheduled freshness reviews, durable email queues, and automated tests. The starter collector's DNS validation mitigates common local-address fetch risks, but production-grade URL fetching should use egress network rules and strict DNS/redirect controls as well.

## Resumable automatic contact collector (v2)

Deploy with `npm ci` as the Render build command. Existing `DATA_DIR`, persistent disk, credentials, and application records must be retained. Schema changes are additive. Do not replace or reinitialize the production database.

In **Collect Contacts**, choose **Start / Resume All Schools**. A single background worker checks one school at a time, saving progress in SQLite. Work continues while the page is closed and resumes after service restarts when enabled. A paused or sleeping Render service cannot collect until running again. Use Pause, Refresh Progress, or Retry Flagged Schools as needed. The collector processes only existing FBS/FCS/D2/D3 schools; it does not add programs.

Set `BRAVE_SEARCH_API_KEY` in Render for schools without saved directory URLs. Discovery requires evidence that a university-owned `.edu` page links to the athletics domain and school-name agreement in search/page titles. Ambiguous names and unsupported layouts are flagged; discovery will deliberately not accept an unproven search result. Existing staff URLs serve as the school's official domain anchor and should be reviewed if previously imported without validation.

The Cheerio parser supports football table rows and common Sidearm staff cards. It associates name, role, email, phone, and X profile within one record. Mixed-sport general directories, ambiguous emails, cross-domain redirects, fetch failures, robots exclusions, conflicting roles/contact identities, and manually edited contacts are flagged. JavaScript-only directories and other unsupported layouts need additional source adapters. Never infer missing contact fields. Automatic verification indicates the named row was observed on the anchored source, not email deliverability. Missing fields remain empty.

`collection_progress` stores school outcomes. `collection_evidence` stores observed contact JSON, source URLs, timestamps, and import/review decisions. Existing contacts are matched by normalized name within a school, email collisions are flagged, and only empty fields are filled. Existing conflicting values, opt-outs, campaigns, leads, and manual edits are preserved. All Edit Contact changes lock the record against automatic updates. Restarting/retrying does not recreate matched coaches.

Tests: `node --test`. No production data or secrets are committed.
