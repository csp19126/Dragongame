# ---- build: frontend + a self-contained server bundle ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime: just Node, the bundle and the migrations (no node_modules needed) ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=5000
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
