# Архитектура Consumer Groups:


---

## Описание папок и файлов:
**ConsumerGroupsPage.tsx** - главная страница
ConsumerGroupsPage.tsx отвечает за композицию страницы и состояние интерфейса.

На frontend-этапе он работает с mock-данными и связывает между собой:

- ConsumerGroupsKpi;
- ConsumerGroupsToolbar;
- ConsumerGroupsTable;
- ConsumerGroupDetails;
- ConsumerLagChart;
- ConsumerDonutCharts;
- OffsetResetWizard.

Здесь находится состояние:

- выбранной Consumer Group;
- поиска;
- фильтра состояния;
- сортировки;
- состояния обновления;
- открытия Offset Reset.

Компоненты не должны самостоятельно управлять состоянием всей страницы.

После подключения backend источник mock-данных будет заменён на `useConsumerGroups()`.

---

**components/** - содержит только React-компоненты, никакой бизнес-логики, никаких axios, никаких запросов, только отображение.
OffsetResetWizard.tsx
отвечает исключительно за интерфейс пошагового сброса offset'ов.

Компонент получает выбранную Consumer Group через props.

Самостоятельно список Consumer Groups и другие данные страницы не загружает.
ConsumerGroupsTable.tsx
отвечает исключительно за отображение таблицы.Не знает, откуда пришли данные.

---

**services/** - здесь лежит работа с Backend.

    consumer-groups.api.ts 
будет содержать:
- getConsumerGroups()
- getConsumerGroup()
- resetOffsets()
- deleteGroup()
- pauseGroup()
- resumeGroup()

То есть только HTTP.

---

**hooks/** - содержит кастомные React Hooks.

    useConsumerGroups() 
будет:
- загружать данные
- обновлять
- кешировать
- хранить loading
- хранить error

---

Во всех страницах останется:

    const {
        groups,
        loading,
        refresh
    } = useConsumerGroups();

и всё.

---

**utils/** - любые вычисления.

Lag

    1234567

↓

    1.23M

или

    Stable

↓

    🟢 Stable

---

**types/** - содержит интерфейсы TypeScript.

    export interface ConsumerGroup {

    }
Никакой логики, только типы.

---

**styles/** - содержит стили css

***Добавляется новый раздел***

    components/

    ConsumerGroupsToolbar.tsx - верхняя панель страницы Consumer Groups (поиск, фильтрация, сортировка, экспорт, обновление, сброс offset'ов).

    ConsumerGroupsTable.tsx - Таблица групп.

    ConsumerLagChart.tsx - График Lag.

    ConsumerGroupDetails.tsx - Панель информации.

    ConsumerMembers.tsx - Участники группы.

    ConsumerOffsets.tsx - Таблица Offset.

    ConsumerGroupsKpi.tsx - KPI карточки Consumer Groups.

    ConsumerKpiCard.tsx - Универсальная KPI карточка.
**consumer-groups.css**

Отвечает за layout страницы Consumer Groups:

- расположение основных секций;
- нижнюю область Details + Consumer Lag;
- расстояния между блоками;
- адаптивное поведение страницы;
- отсутствие лишней прокрутки у панели вкладок.
---

**ConsumerDonutCharts.tsx** - нижняя аналитическая панель страницы.

Отображает три кольцевых графика:

- Топики группы;
- Распределение Lag;
- Состояние групп.

Компонент получает готовый массив `ConsumerGroup[]` через props.

Самостоятельно данные не загружает и не обращается к backend.