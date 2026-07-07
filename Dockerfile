FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_AMAP_JS_API_KEY=
ARG VITE_AMAP_SECURITY_CODE=
ARG VITE_GOOGLE_MAPS_BROWSER_KEY=
ENV VITE_AMAP_JS_API_KEY=$VITE_AMAP_JS_API_KEY
ENV VITE_AMAP_SECURITY_CODE=$VITE_AMAP_SECURITY_CODE
ENV VITE_GOOGLE_MAPS_BROWSER_KEY=$VITE_GOOGLE_MAPS_BROWSER_KEY
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
COPY --from=frontend /app/dist ./dist
RUN chmod +x ./scripts/docker-entrypoint.sh
ENV DATABASE_PATH=/data/voyageplanner.db
ENV UPLOAD_DIR=/data/uploads
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["gunicorn", "--workers", "2", "--threads", "4", "--bind", "0.0.0.0:8080", "backend.app:app"]
