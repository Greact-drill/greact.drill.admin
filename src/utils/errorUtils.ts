/**
 * Извлекает сообщение об ошибке из объекта ошибки
 * Приоритет: response.data.message > response.data.error > error.message > дефолтное сообщение
 */
export function getErrorMessage(error: any, defaultMessage: string = 'Произошла ошибка'): string {
    if (!error) {
        return defaultMessage;
    }

    // Проверяем response.data.message (наиболее частый случай)
    if (error.response?.data?.message) {
        return error.response.data.message;
    }

    // Проверяем response.data.error
    if (error.response?.data?.error) {
        return error.response.data.error;
    }

    // Проверяем response.data (если это строка)
    if (typeof error.response?.data === 'string') {
        return error.response.data;
    }

    // Проверяем error.message
    if (error.message) {
        return error.message;
    }

    // Дефолтное сообщение
    return defaultMessage;
}


