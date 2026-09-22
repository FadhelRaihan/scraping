FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

COPY package*.json ./
COPY apps/frontend/package*.json apps/frontend/
COPY apps/backend/package*.json apps/backend/
COPY apps/scraper/package*.json apps/scraper/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
ENV HEADLESS=1

CMD ["node", "apps/backend/server.js"]
