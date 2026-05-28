import axios from 'axios';

export const httpClient = axios.create({
  timeout: 30000,
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'WB-Reviews-Fetcher/1.0'
  },
    validateStatus: (status) => {
    return (status >= 200 && status < 300) || status === 404;
  }
});

// Интерцептор для логирования
httpClient.interceptors.request.use(
  (config) => {
    console.log(`${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error(' Request error:', error.message);
    return Promise.reject(error);
  }
);

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Сервер ответил с ошибкой
      console.error(` HTTP ${error.response.status}: ${error.response.statusText}`);
      
      if (error.response.status === 404) {
        console.warn(' Product not found');
      } else if (error.response.status >= 500) {
        console.warn(' Wildberries server error');
      }
    } else if (error.request) {
      // Запрос отправлен но нет ответа
      if (error.code === 'ECONNABORTED') {
        console.error(' Request timeout');
      } else if (error.code === 'ENOTFOUND') {
        console.error(' DNS lookup failed');
      } else if (error.code === 'ECONNREFUSED') {
        console.error(' Connection refused');
      } else {
        console.error(' Network error:', error.message);
      }
    } else {
      console.error(' Request setup error:', error.message);
    }
    
    return Promise.reject(error);
  }
);