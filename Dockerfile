# syntax=docker/dockerfile:1
# Why: the build stage packs the same tarball that npm publishes, so the image runs the code users install.
FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && pnpm pack --pack-destination /out

# Why: the yfinance library runs under python3 (YfinanceAdapter); OCRmyPDF and PyMuPDF are the OCR and table tools (ADR 0027). Its stage keeps pip and the venv out of the final image.
# The venv is copied as it is, so both stages must use the same base image tag (same Alpine packages and python3).
FROM node:22-alpine AS pydeps
COPY requirements-tools.txt /tmp/requirements-tools.txt
# Why: pymupdf 1.28.2 has a musllinux wheel for amd64 only; on arm64 pip builds it from source, which needs a C compiler and the Python headers. Only this stage has them, so the final image does not.
RUN apk add --no-cache python3 py3-pip build-base python3-dev \
  && python3 -m venv /opt/yf \
  && /opt/yf/bin/pip install --no-cache-dir -r /tmp/requirements-tools.txt

FROM node:22-alpine
ENV NODE_ENV=production INVESTMENT_MCP_CACHE_DIR=/cache INVESTMENT_MCP_OCRMYPDF=/opt/yf/bin/ocrmypdf INVESTMENT_MCP_PYTHON=/opt/yf/bin/python3 PATH="/opt/yf/bin:${PATH}"
# Why: the runtime needs python3, not pip; the venv carries yfinance, OCRmyPDF and PyMuPDF. Tesseract reads the scanned pages in Portuguese and English, and Ghostscript is installed because OCRmyPDF may call it for PDF output (not verified in this image).
RUN apk add --no-cache python3 tesseract-ocr tesseract-ocr-data-por tesseract-ocr-data-eng ghostscript
COPY --from=pydeps /opt/yf /opt/yf
COPY --from=build /out/better-investment-mcp-*.tgz /tmp/package.tgz
# Why: the cache directory belongs to the non-root user, so the server can write its DuckDB file there.
RUN npm install --global --omit=dev /tmp/package.tgz \
  && rm /tmp/package.tgz \
  && mkdir /cache \
  && chown node:node /cache
USER node
VOLUME ["/cache"]
# Why: HTTP mode listens on 3100 when INVESTMENT_MCP_TRANSPORT=http; over stdio the health command passes at once.
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["better-investment-mcp", "health"]
ENTRYPOINT ["better-investment-mcp"]
