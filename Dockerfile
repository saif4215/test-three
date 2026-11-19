# ICSI store: a production image.
#   docker build -t icsi-store .
#   docker run -p 3000:3000 --env-file .env -v icsi-uploads:/data/uploads icsi-store
# It applies database migrations (additive and safe to repeat) and then starts the web server.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 UPLOAD_DIR=/data/uploads
# Migrations and the admin helper run with tsx, so the full set of dependencies is kept.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/public ./public
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 3000
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm start"]
