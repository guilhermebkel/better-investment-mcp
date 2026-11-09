# syntax=docker/dockerfile:1
# Why: the build stage packs the same tarball that npm publishes, so the image runs the code users install.
FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && pnpm pack --pack-destination /out

# Why: the yfinance library runs under python3 (YfinanceAdapter). Its stage keeps pip and the venv out of the final image.
# The venv is copied as it is, so both stages must use the same base image tag (same Alpine packages and python3).
FROM node:22-alpine AS pydeps
RUN apk add --no-cache python3 py3-pip \
  && python3 -m venv /opt/yf \
  && /opt/yf/bin/pip install --no-cache-dir "yfinance==1.8.0"

FROM node:22-alpine
ENV NODE_ENV=production INVESTMENT_MCP_CACHE_DIR=/cache PATH="/opt/yf/bin:${PATH}"
# Why: the runtime needs python3 only, not pip. The venv carries yfinance and its dependencies.
RUN apk add --no-cache python3
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
