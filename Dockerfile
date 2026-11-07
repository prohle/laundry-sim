# Fold: Next.js server plus the Rust solver it spawns (task 5.5).
# docker build -t fold .   docker run --rm -p 3000:3000 fold

# ---- 1. solver: cargo, release build --------------------------------------------------------
FROM rust:1-slim-bookworm AS solver
WORKDIR /build/solver
COPY solver/Cargo.toml solver/Cargo.lock ./
COPY solver/src ./src
RUN cargo build --release --locked

# ---- 2. web: install dependencies, next build -----------------------------------------------
FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 3. runtime: standalone server, static assets, solver binary ----------------------------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    FOLD_SOLVER=/app/bin/fold-solver
WORKDIR /app
COPY --from=web /app/.next/standalone ./
COPY --from=web /app/.next/static ./.next/static
COPY --from=solver /build/solver/target/release/fold-solver /app/bin/fold-solver
USER node
EXPOSE 3000
CMD ["node", "server.js"]
