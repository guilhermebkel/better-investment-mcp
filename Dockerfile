# Why: the build stage packs the same tarball that npm publishes, so the image runs the code users install.
FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && pnpm pack --pack-destination /out

FROM node:22-alpine
ENV NODE_ENV=production INVESTMENT_MCP_CACHE_DIR=/cache
COPY --from=build /out/better-investment-analysis-mcp-*.tgz /tmp/package.tgz
# Why: the cache directory belongs to the non-root user, so the server can write its DuckDB file there.
RUN npm install --global --omit=dev /tmp/package.tgz \
  && rm /tmp/package.tgz \
  && mkdir /cache \
  && chown node:node /cache
USER node
VOLUME ["/cache"]
# Why: HTTP mode listens on 3100 when INVESTMENT_MCP_TRANSPORT=http; over stdio the health command passes at once.
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["better-investment-analysis-mcp", "health"]
ENTRYPOINT ["better-investment-analysis-mcp"]
