# wb_reviews_analyzer

Сервис для автоматизированного сбора, хранения и AI-анализа пользовательских отзывов о товарах маркетплейса Wildberries.

## Описание

Проект представляет собой backend-приложение, предназначенное для автоматического получения отзывов о товарах, хранения и кэширования данных, анализа пользовательских отзывов с использованием LLM, сравнения старых и новых отзывов, выявления преимуществ, недостатков и повторяющихся проблем товара.

## Технологии

- **Backend**: NestJS (TypeScript)
- **База данных**: PostgreSQL + TypeORM
- **Сбор данных**: Wildberries Feedbacks API
- **Анализ текста**: LLM (Ollama / OpenRouter)
- **Контейнеризация**: Docker + Docker Compose

## Структура проекта
<pre>
wb-reviews-fetcher/
├── src/
│   ├── domain/                       # Доменный слой
│   │   ├── entities/                 # Review, ReviewCollection
│   │   ├── valueObjects/             # ProductId, DateRange
│   │   └── errors/                   # DomainErrors
│   ├── application/                  # Слой приложения
│   │   ├── ports/                    # Интерфейсы
│   │   └── use-cases/                # Бизнес-сценарии
│   ├── infrastructure/               # Инфраструктура
│   │   ├── config/                   # HTTP клиент
│   │   ├── gateways/                 # WB API клиент
│   │   ├── sinks/                    # JSON сохранение
│   │   ├── llm/                      # LLM клиент
│   │   └── persistence/              # PostgreSQL
│   └── interfaces/                   # Интерфейсы
│       ├── cli/                      # CLI утилита
│       └── http/                     # NestJS API
│           ├── reviews/              # Контроллеры и сервисы
│           │ └── dto/                # DTO для валидации
│           └── filters/              # Обработчики ошибок
├── output/                           # Результаты
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
</pre>

## Установка и запуск

### Локальный запуск
1. Склонируйте репозититорий

2. Установите зависимости: npm install

3. Создайте базу данных wb_reviews в PostgreSQL.

4. Создайте файл .env и укажите параметры подключения как в .env.example

5. Запустите сервер: ```npm run start:server```

6. Откройте браузер и проверьте: ```http://localhost:3000/```

### Запуск в Docker
```
docker compose up --build
```
После сборки сервис будет доступен на ```http://localhost:3000```.

## API

### Сбор отзывов
```
# Отзывы за последние 90 дней (по умолчанию)
"http://localhost:3000/reviews?productId=628460737"

# Все отзывы, новые за последние 30 дней
"http://localhost:3000/reviews?productId=628460737&splitDays=30"

# Отзывы за конкретный период
"http://localhost:3000/reviews productId=628460737&dateFrom=2026-01-01&dateTo=2026-05-01&splitDays=7"

# Cобрать заново
"http://localhost:3000/reviews?productId=628460737&refresh=true"
```

Пример ответа:
```
{
  "success": true,
  "data": {
    "productId": "628460737",
    "statistics": {
      "newCount": 128,
      "oldCount": 889
    },
    "reviews": {
      "new": [],
      "old": []
    }
  }
}
```
### Сводка отзывов (суммаризация)

```GET /reviews/analyze?productId=628460737```

Пример ответа:
```
{
  "success": true,
  "data": {
    "productId": "628460737",
    "splitPeriod": {
      "days": 90,
      "from": "2026-02-20T00:00:00.000Z",
      "to": "2026-05-21T23:59:59.999Z"
    },
    "totalInCollection": 1016,
    "statistics": {
      "newCount": 577,
      "oldCount": 439
    },
    "ratingChange": {
      "old": 4.2,
      "new": 4.5,
      "difference": 0.3
    },
    "oldReviews": {
      "pros": ["Качество товара", "Быстрая доставка", "Доступная цена"],
      "cons": ["Проблемы с упаковкой", "Наклейки на товаре"],
      "commonIssues": [
        {
          "issue": "маломерит",
          "frequency": "часто",
          "examples": ["заказал L, пришел M"]
        }
      ],
      "summary": "Покупатели довольны качеством, но жалуются на размерную сетку..."
    },
    "newReviews": {
      "pros": ["Качество улучшилось", "Быстрая доставка"],
      "cons": [],
      "commonIssues": [],
      "summary": "В новых отзывах отмечается улучшение логистики..."
    },
    "differences": {
      "newIssues": [],
      "resolvedIssues": ["Проблемы с упаковкой", "маломерит"],
      "increasedIssues": [],
      "decreasedIssues": [],
      "stableIssues": ["Качество товара"],
      "overallChanges": "Улучшилась доставка, исправлена размерная сетка."
    },
    "fromCache": false,
    "executionTime": "8.5s"
  }
}
```

## Как найти imtId товара

1. Откройте страницу товара на Wildberries.
2. Нажмите на кнопку отзывов.
3. Скопируйте значение параметра imtId из URL открывшейся страницы.
