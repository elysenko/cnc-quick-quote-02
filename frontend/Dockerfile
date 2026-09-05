# Frontend build for template-enterprise apps (sub-15 L1 golden template).
# Pattern: prebaked-dependency base image + guarded seed reuse. The base image
# (platform/Dockerfile.base-angular, tag v2) prebakes node_modules for EXACTLY this
# template's dep set at /opt/colossus/angular-warmup. Apps that keep the template's
# dependencies verbatim skip `npm install` entirely; any dep drift falls back to a
# normal install (still served by the image's warm /root/.npm cache).
# Build context: this directory (frontend/). Multi-stage shape mirrors the known-good
# template-web/Dockerfile.frontend.
FROM ubuntu:30500/colossus-base-angular:v2 AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# Compare only dependencies+devDependencies — the app may rename itself, but the dep
# SET is what the seed prebaked. Byte-compare would miss on harmless name edits.
RUN if node -e "const a=require('./package.json'),b=require('/opt/colossus/angular-warmup/package.json');const k=o=>JSON.stringify([o.dependencies||{},o.devDependencies||{}]);process.exit(k(a)===k(b)?0:1)"; then \
      echo 'angular-warmup seed HIT: reusing prebaked node_modules (npm install skipped)'; \
      cp -a /opt/colossus/angular-warmup/node_modules ./node_modules; \
    else \
      echo 'angular-warmup seed MISS: dep set diverged from template — npm install fallback'; \
      npm install --no-audit --no-fund --loglevel=error; \
    fi
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
