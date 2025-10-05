# --- ЭТАП 1: Сборка приложения ---
FROM node:22-alpine AS builder

# Устанавливаем рабочую директорию
WORKDIR /app

# Объявляем аргумент, который будет получен из docker-compose
ARG VITE_API_URL

# Устанавливаем переменную окружения для процесса сборки
ENV VITE_API_URL=${VITE_API_URL}

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходный код
COPY . .

# Собираем приложение
# Vite использует VITE_API_URL на этом шаге
RUN npm run build


# --- ЭТАП 2: Запуск на Nginx ---
FROM nginx:stable-alpine

# Копируем собранные файлы из этапа 'builder'
# Vite по умолчанию собирает всё в папку 'dist'
COPY --from=builder /app/dist /usr/share/nginx/html

# Копируем кастомный конфиг Nginx для корректной работы React Router
# (создай файл nginx.conf рядом с Dockerfile, его содержимое ниже)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Указываем, что контейнер будет слушать порт 80
EXPOSE 80

# Nginx запустится автоматически при старте контейнера
CMD ["nginx", "-g", "daemon off;"]