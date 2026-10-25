# Sproutly backend: FastAPI with the trained models, CPU only (D11, #126).
#
# Built by .github/workflows/deploy-backend.yml from the repository root, after it has
# downloaded the model files into sproutly-backend/models/ at the revision pinned in
# sproutly-backend/model_revision.txt. Secrets are never in the image: Azure passes them as
# environment variables (the App Service settings). See sproutly-backend/DEPLOY.md.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TORCH_HOME=/opt/torch

WORKDIR /app

# Packages first, so a code-only change reuses this (large) layer.
COPY sproutly-backend/requirements.txt .
RUN pip install -r requirements.txt

# The leaf check's frozen MobileNetV3 with its ImageNet weights (models/leaf_check.json):
# downloaded now, not at every start.
RUN python -c "from torchvision import models; models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.IMAGENET1K_V2)"

COPY sproutly-backend/ .
# The reviewed advice file, imported into an empty library on the first start (start.sh).
COPY ml/data/advice/advice.csv data/advice.csv

# Which model files are inside, shown by /health and the app's About screen.
ARG MODEL_REVISION=unknown
ENV MODEL_REVISION=${MODEL_REVISION}

# Run as an ordinary user, not root.
RUN useradd --create-home --uid 1000 sproutly && chown -R sproutly /app
USER sproutly

EXPOSE 8000
CMD ["sh", "start.sh"]
