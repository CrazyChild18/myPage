FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY --from=frontend /app/dist ./dist
ENV DATABASE_PATH=/data/voyageplanner.db
ENV PORT=8080
EXPOSE 8080
CMD ["gunicorn", "--workers", "2", "--threads", "4", "--bind", "0.0.0.0:8080", "backend.app:app"]
