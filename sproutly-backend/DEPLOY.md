# Deploying the Sproutly backend (Azure App Service)

How the backend runs in the cloud (decision D11, issue #126). Do the parts in order; each
ends with a check. No secret goes into Git or into the Docker image: secrets are typed into
Azure's and GitHub's settings pages only.

```
GitHub (merge to main) -> GitHub Actions: download the models (Hugging Face, pinned version),
                          build the image, push it (private) to ghcr.io
                       -> Azure App Service runs that image
                              |-- Azure PostgreSQL (accounts, checks, advice)
                              |-- /home/uploads (photos; kept across restarts, deleted after 30 days)
                              `-- Groq (assistant questions only)
```

## 1. Model files on Hugging Face (private)

The model files are not in Git. They live in a private Hugging Face model repository, and the
build downloads them at the exact version written in `model_revision.txt`.

1. Create a free account at huggingface.co, then **New model**: name `sproutly-models`,
   **Private**.
2. Upload, keeping the folder names (from `sproutly-backend`, with the virtual environment on):

   ```
   pip install huggingface_hub
   hf auth login
   hf upload <your-username>/sproutly-models models . --repo-type model --include "d17_resnet50_seed44/*" --include "d22_convnext_tiny_lr1e-04/*" --include "d22_efficientnet_b0/*" --include "leaf_check.json"
   ```

   (Only these four: the `models` folder also holds older models the backend no longer uses.)

   The repository must then contain:
   `d17_resnet50_seed44/model.pt`, `d22_convnext_tiny_lr1e-04/model.pt`,
   `d22_efficientnet_b0/model.pt` and `leaf_check.json` (about 220 MB).
3. Write the model card (`README.md` in that repository): what the models are, the data,
   the results, the licences.
4. Open **Files and versions -> History**, copy the full commit id (40 characters) of the
   upload, and put it in `sproutly-backend/model_revision.txt` (by a PR, so every model change
   is reviewed and recorded).
5. **Settings -> Access Tokens -> Create new token**: type **Read**. Copy it for step 3.

Check: the four files show in the repository, and it says **Private**.

## 2. Azure (region Italy North, one resource group `sproutly-rg`)

### 2a. Database: Azure Database for PostgreSQL, flexible server

- Workload: **Development**; compute **Burstable, B1ms**; PostgreSQL 16.
- Authentication: PostgreSQL authentication; choose an admin name and a strong password.
- Networking: public access, tick **Allow public access from any Azure service**, and
  **Add current client IP address** (for step 5).
- After it is created: **Databases -> Add**: `sproutly`.

The connection string for the backend (one line):

```
postgresql+psycopg2://<admin>:<password>@<server>.postgres.database.azure.com:5432/sproutly?sslmode=require
```

### 2b. Backend: Web App

- **Create -> Web App**: publish **Container**, operating system **Linux**, region Italy
  North, pricing plan **Basic B1**.
- Container: choose the quickstart image for now; the first deployment replaces it.
- After it is created, **Deployment Center -> Settings**: registry **Private registry**,
  server `https://ghcr.io`, username your GitHub username, password a GitHub token
  (classic, scope `read:packages` only, **expiry 31 December 2026**).
- **Configuration -> General settings**: **Always On: On**; **SCM Basic Auth Publishing
  Credentials: On** (needed for the publish profile below).
- **Health check**: path `/health`.

### 2c. Settings (Configuration -> Environment variables)

These replace the `.env` file. Generate new keys for the cloud; do not reuse the laptop's.

| Name | Value |
|---|---|
| `DATABASE_URL` | the connection string from 2a |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `TOTP_ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `GROQ_API_KEY` | a Groq key (make a separate one, e.g. `sproutly-prod`) |
| `UPLOAD_DIR` | `/home/uploads` |
| `WEBSITES_ENABLE_APP_SERVICE_STORAGE` | `true` (keeps `/home` across restarts) |
| `WEBSITES_PORT` | `8000` |
| `APP_ENV` | `production` |
| `DEBUG` | `false` |
| `PUBLIC_BASE_URL` | `https://<app-name>.azurewebsites.net` |
| `ADMIN_PORTAL_URL` | the portal's address (Cloudflare Pages) |
| `CORS_ORIGINS` | `["https://<portal-address>"]` (a JSON list) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | only if Continue with Google is used; add the new address in Google's console |

### 2d. Publish profile

**Overview -> Download publish profile**. The whole file's text goes into GitHub (step 3).

## 3. GitHub (repository Settings -> Secrets and variables -> Actions)

| Kind | Name | Value |
|---|---|---|
| Secret | `HF_TOKEN` | the Hugging Face read token |
| Secret | `AZURE_WEBAPP_PUBLISH_PROFILE` | the publish profile's text |
| Variable | `HF_MODEL_REPO` | `<your-username>/sproutly-models` |
| Variable | `AZURE_WEBAPP_NAME` | the Web App's name |

The deploy workflow does nothing until `AZURE_WEBAPP_NAME` exists.

## 4. First deployment

1. Merge the PR that sets `model_revision.txt`, or run **Actions -> Deploy backend -> Run
   workflow**.
2. Watch the run in **Actions** (about 10-15 minutes the first time).
3. On GitHub, **Packages -> sproutly-backend -> Package settings**: check it is **Private**.
4. Open `https://<app-name>.azurewebsites.net/health`. Expected: `"status": "ok"`, the model
   version, and the Hugging Face commit. The first start also fills the advice library (63
   entries) and creates the tables.

If the app does not start, **Log stream** in Azure shows why (for example a missing setting).

## 5. The first administrator

From `sproutly-backend` on the laptop, with the virtual environment on, point the command at
the cloud database for this one run (PowerShell):

```
$env:DATABASE_URL = "<the connection string from 2a>"
python -m app.scripts.create_admin --email you@example.org --name "Your Name"
Remove-Item Env:DATABASE_URL
```

Then sign in to the portal and set up the authenticator.

## Later changes

- **Code**: merge a PR; the workflow builds and deploys it.
- **Threshold or temperature**: change `CONFIDENCE_THRESHOLD` or `TEMPERATURE` in the Azure
  settings and restart; no new image.
- **New model files**: upload to Hugging Face, put the new commit id in `model_revision.txt`,
  merge. Each diagnosis records the model version it used.
- **Roll back**: Deployment Center -> choose the previous image tag (each tag is a commit), or
  rerun an earlier successful workflow run.
- **Cost**: Azure bills the plans per hour, not per deployment; building happens on GitHub.
