export type SchemeWidgetType =
  | 'powerSource'
  | 'ground'
  | 'load'
  | 'switch'
  | 'fuse'
  | 'circuitBreaker'
  | 'disconnector'
  | 'relay'
  | 'contactor'
  | 'thermalRelay'
  | 'starter'
  | 'resistor'
  | 'variableResistor'
  | 'capacitor'
  | 'inductor'
  | 'transformer'
  | 'diode'
  | 'led'
  | 'zenerDiode'
  | 'transistor'
  | 'pushButton'
  | 'emergencyStop'
  | 'modeSelector'
  | 'signalLamp'
  | 'buzzer'
  | 'ammeter'
  | 'voltmeter'
  | 'temperatureSensor'
  | 'pressureSensor'
  | 'levelSensor'
  | 'vibrationSensor'
  | 'plc'
  | 'motor'
  | 'generator'
  | 'mcc'
  | 'busbar';

export interface SchemeWidgetDefinition {
  type: SchemeWidgetType;
  label: string;
  description: string;
  category: string;
  width: number;
  height: number;
}

export const SCHEME_WIDGET_LIBRARY: SchemeWidgetDefinition[] = [
  { type: 'powerSource', label: 'Источник питания', description: 'Питание шкафа, панели или секции.', category: 'Питание и шины', width: 132, height: 94 },
  { type: 'ground', label: 'Земля', description: 'Точка заземления или PE-проводник.', category: 'Питание и шины', width: 92, height: 86 },
  { type: 'load', label: 'Нагрузка', description: 'Обобщенная нагрузка цепи.', category: 'Питание и шины', width: 120, height: 90 },
  { type: 'busbar', label: 'Busbar', description: 'Шина питания или распределения.', category: 'Питание и шины', width: 220, height: 42 },
  { type: 'fuse', label: 'Предохранитель', description: 'Быстродействующая токовая защита.', category: 'Защита', width: 112, height: 84 },
  { type: 'circuitBreaker', label: 'Автомат', description: 'Автоматический выключатель с защитой.', category: 'Защита', width: 116, height: 88 },
  { type: 'thermalRelay', label: 'Тепловое реле', description: 'Защита двигателя от перегрузки.', category: 'Защита', width: 122, height: 90 },
  { type: 'switch', label: 'Выключатель', description: 'Простой однополюсный выключатель.', category: 'Коммутация и управление', width: 120, height: 84 },
  { type: 'disconnector', label: 'Разъединитель', description: 'Разрыв цепи для обслуживания.', category: 'Коммутация и управление', width: 126, height: 84 },
  { type: 'relay', label: 'Реле', description: 'Промежуточное реле управления.', category: 'Коммутация и управление', width: 116, height: 92 },
  { type: 'contactor', label: 'Контактор', description: 'Силовой контактор.', category: 'Коммутация и управление', width: 126, height: 96 },
  { type: 'starter', label: 'Пускатель', description: 'Магнитный пускатель.', category: 'Коммутация и управление', width: 132, height: 98 },
  { type: 'pushButton', label: 'Кнопка', description: 'Кнопка управления цепью.', category: 'Коммутация и управление', width: 110, height: 92 },
  { type: 'emergencyStop', label: 'Аварийный стоп', description: 'Красная кнопка аварийного останова.', category: 'Коммутация и управление', width: 116, height: 98 },
  { type: 'modeSelector', label: 'Переключатель режимов', description: 'AUTO / MAN / OFF.', category: 'Коммутация и управление', width: 120, height: 96 },
  { type: 'resistor', label: 'Резистор', description: 'Постоянное сопротивление.', category: 'Пассивные и полупроводники', width: 126, height: 82 },
  { type: 'variableResistor', label: 'Переменный резистор', description: 'Регулируемое сопротивление.', category: 'Пассивные и полупроводники', width: 132, height: 90 },
  { type: 'capacitor', label: 'Конденсатор', description: 'Емкостной элемент цепи.', category: 'Пассивные и полупроводники', width: 110, height: 90 },
  { type: 'inductor', label: 'Катушка / индуктивность', description: 'Индуктивный элемент или катушка.', category: 'Пассивные и полупроводники', width: 136, height: 92 },
  { type: 'transformer', label: 'Трансформатор', description: 'Две связанные катушки.', category: 'Пассивные и полупроводники', width: 146, height: 96 },
  { type: 'diode', label: 'Диод', description: 'Односторонняя проводимость.', category: 'Пассивные и полупроводники', width: 118, height: 84 },
  { type: 'led', label: 'Светодиод', description: 'Светоизлучающий диод.', category: 'Пассивные и полупроводники', width: 124, height: 90 },
  { type: 'zenerDiode', label: 'Стабилитрон', description: 'Диод стабилизации напряжения.', category: 'Пассивные и полупроводники', width: 126, height: 86 },
  { type: 'transistor', label: 'Транзистор', description: 'Полупроводниковый ключ или усилитель.', category: 'Пассивные и полупроводники', width: 118, height: 96 },
  { type: 'signalLamp', label: 'Индикаторная лампа', description: 'Круглая лампа состояния.', category: 'Индикация и измерение', width: 92, height: 98 },
  { type: 'buzzer', label: 'Зуммер', description: 'Звуковая сигнализация.', category: 'Индикация и измерение', width: 110, height: 94 },
  { type: 'ammeter', label: 'Амперметр', description: 'Измеритель тока.', category: 'Индикация и измерение', width: 112, height: 102 },
  { type: 'voltmeter', label: 'Вольтметр', description: 'Измеритель напряжения.', category: 'Индикация и измерение', width: 112, height: 102 },
  { type: 'temperatureSensor', label: 'Датчик температуры', description: 'Контроль температуры узла.', category: 'Датчики и автоматика', width: 112, height: 102 },
  { type: 'pressureSensor', label: 'Датчик давления', description: 'Контроль давления линии.', category: 'Датчики и автоматика', width: 112, height: 102 },
  { type: 'levelSensor', label: 'Датчик уровня', description: 'Контроль уровня среды.', category: 'Датчики и автоматика', width: 112, height: 102 },
  { type: 'vibrationSensor', label: 'Датчик вибрации', description: 'Контроль вибрации агрегата.', category: 'Датчики и автоматика', width: 112, height: 102 },
  { type: 'plc', label: 'PLC', description: 'Программируемый логический контроллер.', category: 'Датчики и автоматика', width: 150, height: 108 },
  { type: 'motor', label: 'Электродвигатель', description: 'Привод механизма.', category: 'Механизмы и шкафы', width: 122, height: 110 },
  { type: 'generator', label: 'Генератор', description: 'Источник генерации энергии.', category: 'Механизмы и шкафы', width: 122, height: 110 },
  { type: 'mcc', label: 'MCC', description: 'Motor Control Center.', category: 'Механизмы и шкафы', width: 160, height: 116 },
];

export const SCHEME_WIDGET_TYPE_SET = new Set<string>(SCHEME_WIDGET_LIBRARY.map((item) => item.type));

export function isSchemeWidgetType(value: string): value is SchemeWidgetType {
  return SCHEME_WIDGET_TYPE_SET.has(value);
}

export function getSchemeWidgetDefinition(type: SchemeWidgetType): SchemeWidgetDefinition {
  return SCHEME_WIDGET_LIBRARY.find((item) => item.type === type) ?? SCHEME_WIDGET_LIBRARY[0];
}
