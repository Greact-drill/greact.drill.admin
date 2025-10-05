# --- ЭТАП 1: Сборка приложения ---
FROM node:22-alpine AS builder

WORKDIR /app

# Объявляем аргумент, который будет получен из docker-compose
ARG VITE_API_URL

# Устанавливаем переменную окружения для процесса сборки
ENV VITE_API_URL=${VITE_API_URL}

COPY package*.json ./
RUN npm ci
COPY . .

# --- НАЧАЛО ДИАГНОСТИКИ ---

# 1. Выводим в лог значение переменной, чтобы увидеть, что Docker её получил.
RUN echo "Build-time VITE_API_URL is: $VITE_API_URL"

# 2. ПРОВЕРКА: Если переменная пустая, сборка упадёт с понятной ошибкой.
#    Это самая частая причина проблемы.
RUN test -n "$VITE_API_URL" || (echo "--> ОШИБКА: VITE_API_URL не задана или пуста!" && echo "--> Пожалуйста, задайте её в переменных окружения стека в Portainer." && exit 1)

# --- КОНЕЦ ДИАГНОСТИКИ ---

# 3. Запускаем сборку.
#    Теперь мы уверены, что переменная окружения существует.
RUN npm run build


# --- ЭТАП 2: Запуск на Nginx ---
FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
