# Kafka System Control
# Архитектура загрузочной страницы (Loading Screen Architecture)

## 1. Назначение

Loading Screen — это отдельный слой инициализации приложения Kafka System Control.

Его задача:

- показать пользователю процесс запуска приложения;
- выполнить первоначальные проверки перед открытием интерфейса;
- подготовить приложение к работе;
- передать управление основному приложению после успешной инициализации.

Loading Screen не является частью бизнес-логики Kafka.

Он отвечает только за процесс запуска приложения.


---

# 2. Общая архитектура


```
Browser
   |
   |
   ▼
index.html
   |
   |
   ▼
main.jsx
   |
   |
   ▼
LoadingBootstrap
   |
   |
   ├───────────────────────┐
   |                       |
   ▼                       ▼
useLoading()          LoadingScreen
   |
   |
   ├── Initialization
   |
   ├── Configuration
   |
   ├── Backend check
   |
   ├── Kafka check
   |
   ▼
completed = true

   |
   |
   ▼

App.jsx

   |
   |
   ▼

Application UI
```


---

# 3. Структура файлов


```
src
│
├── main.jsx
│
├── App.jsx
│
└── components
    │
    └── loading
        │
        ├── LoadingBootstrap.tsx
        │
        ├── LoadingScreen.tsx
        │
        ├── LoadingLogo.tsx
        │
        ├── LoadingProgress.tsx
        │
        ├── LoadingStatus.tsx
        │
        ├── hooks
        │   │
        │   └── useLoading.ts
        │
        ├── types
        │   │
        │   └── loading.ts
        │
        └── styles
            │
            └── loading-screen.css

```


---

# 4. main.jsx

## Расположение

```
src/main.jsx
```


## Назначение

Главная точка входа React приложения.


Отвечает за:

- подключение глобальных стилей;
- подключение Context Provider;
- создание React Root;
- запуск LoadingBootstrap.


main.jsx не содержит:

- API запросов;
- Kafka логики;
- проверки состояния;
- логики страниц.


Его задача:

запустить приложение.


Поток:

```
main.jsx

      |

      ▼

LoadingBootstrap

      |

      ▼

App.jsx
```


---

# 5. LoadingBootstrap.tsx


## Расположение

```
src/components/loading/LoadingBootstrap.tsx
```


## Назначение

Главный контроллер перехода между:

```
Loading Screen
        |
        ▼
Application
```


Компонент связывает:

```
useLoading()
      |
      ▼
LoadingScreen
      |
      ▼
App
```


## Ответственность


LoadingBootstrap:

- запускает процесс инициализации;
- получает состояние загрузки;
- показывает LoadingScreen;
- после завершения открывает App.


Логика:

```typescript
if (!loading.completed)

    показать LoadingScreen


else

    открыть App
```


---

# 6. LoadingScreen.tsx


## Расположение

```
src/components/loading/LoadingScreen.tsx
```


## Назначение

Главный визуальный контейнер загрузочного экрана.


Объединяет:


```
LoadingLogo

      |

      ▼

LoadingProgress

      |

      ▼

LoadingStatus

```


Компонент отвечает только за UI.


Не содержит:

- API;
- запросов;
- таймеров;
- бизнес-логики.


---

# 7. LoadingLogo.tsx


## Расположение

```
src/components/loading/LoadingLogo.tsx
```


## Назначение


Отображает фирменный логотип Kafka System Control.


Ответственность:

- вывод изображения;
- сохранение пропорций;
- визуальная часть логотипа.


Не содержит:

- состояния;
- загрузки;
- логики.


---

# 8. LoadingProgress.tsx


## Расположение

```
src/components/loading/LoadingProgress.tsx
```


## Назначение


Отображает визуальный индикатор активности.


Важно:

Это не реальный процент загрузки.


Он используется как:

```
Visual Loading Indicator
```


Отвечает за:

- свечение;
- анимацию;
- визуальную обратную связь пользователю.


---

# 9. LoadingStatus.tsx


## Расположение

```
src/components/loading/LoadingStatus.tsx
```


## Назначение


Отображает текущее состояние запуска.


Примеры:


```
Инициализация...

Загрузка конфигурации...

Подключение к серверу...

Подключение к Kafka...

Готово
```


Компонент получает только текст.


Он не определяет состояние.


---

# 10. useLoading.ts


## Расположение

```
src/components/loading/hooks/useLoading.ts
```


## Назначение


Центральный Hook управления процессом запуска.


Отвечает за последовательность:


```
Initialization

      ↓

Configuration

      ↓

Backend

      ↓

Kafka

      ↓

Complete
```


---

## Этапы загрузки


### 1. Initialization


Проверка запуска React приложения.


Статус:

```
Инициализация...
```


---

### 2. Configuration


Получение локальной конфигурации.


Например:

- сохраненные Kafka кластеры;
- пользовательские настройки.


---

### 3. Backend


Проверка доступности backend.


Используется API:

```
GET /api/overview
```


Цель:

понять, что сервер приложения работает.


---

### 4. Kafka


Проверка соединения с Kafka кластером.


Используется:

```
/api/clusters/health
```


---

### 5. Complete


После успешного завершения:


```
completed = true
```


LoadingBootstrap открывает:


```
App.jsx
```


---

# 11. loading.ts


## Расположение


```
src/components/loading/types/loading.ts
```


## Назначение


Общие TypeScript типы системы загрузки.


Содержит:


## LoadingStage


Описание этапов:


```
INITIALIZATION

SERVER

CONFIGURATION

CLUSTER

DATA

COMPLETE
```


---

## LoadingState


Полное состояние загрузки:


```typescript
{
    progress,
    currentStage,
    message,
    completed
}
```


---

# 12. loading-screen.css


## Расположение


```
src/components/loading/styles/loading-screen.css
```


## Назначение


Все визуальные стили Loading Screen.


Отвечает за:


## Экран

```
background
position
layout
```


## Логотип

```
размер
выравнивание
пропорции
```


## Индикатор

```
свечение
анимация
gradient
```


## Текст

```
цвет
размер
позиция
```


---

# 13. Полный жизненный цикл запуска


```
Пользователь открывает приложение

            |

            ▼

Браузер загружает index.html

            |

            ▼

React запускает main.jsx

            |

            ▼

LoadingBootstrap запускается

            |

            ▼

useLoading выполняет проверки

            |

            ▼

LoadingScreen показывает состояние

            |

            ▼

Инициализация завершена

            |

            ▼

LoadingBootstrap запускает App.jsx

            |

            ▼

Открывается интерфейс приложения

```


---

# 14. Архитектурные принципы


## Разделение ответственности


Loading UI:

```
components/loading
```


занимается только отображением.


Logic:

```
hooks/useLoading
```


занимается состоянием запуска.


Application:

```
App.jsx
```


занимается основным интерфейсом.


---

## Почему такой подход используется


Преимущества:


- нет двойного Splash Screen;
- нет пустого экрана;
- проще добавлять новые проверки;
- Loading Screen не зависит от страниц;
- Backend интегрируется без изменения UI;
- приложение имеет контролируемый запуск.


---

# 15. Будущее расширение


В дальнейшем Loading System может получать:


- проверку версии приложения;
- загрузку пользователя;
- получение списка кластеров;
- загрузку Kafka metadata;
- предварительную загрузку Overview данных.


При этом визуальная часть Loading Screen изменяться не будет.


Меняется только источник состояния загрузки.


---

# Итоговая схема ответственности


```
main.jsx

    |
    ▼

LoadingBootstrap

    |
    ├── useLoading
    |       |
    |       ├── Backend
    |       ├── Configuration
    |       └── Kafka
    |
    ▼

LoadingScreen

    |
    ├── LoadingLogo
    ├── LoadingProgress
    └── LoadingStatus


После завершения:

    |
    ▼

App.jsx
```
