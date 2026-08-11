/** Декодер Google-полилинии (https://developers.google.com/maps/documentation/
 *  utilities/polylinealgorithm) с переменной точностью — нужен, чтобы
 *  разобрать геометрию маршрута OSRM (MAP-020). OSRM отдаёт geometry как
 *  polyline6 (precision = 6) или polyline5 (precision = 5) в зависимости от
 *  параметра запроса — сервис явно указывает polyline6 и декодирует здесь же.
 *
 *  Чистая функция без I/O — покрыта тестами отдельно от провайдеров. */

export interface PolylinePoint {
  lat: number;
  lng: number;
}

export function decodePolyline(encoded: string, precision = 6): PolylinePoint[] {
  const factor = Math.pow(10, precision);
  const points: PolylinePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const latValue = readSignedValue(encoded, index);
    index = latValue.nextIndex;
    const lngValue = readSignedValue(encoded, index);
    index = lngValue.nextIndex;
    lat += latValue.value;
    lng += lngValue.value;
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

/** Читает один signed value из полилинии начиная с позиции startIndex.
 *  Возвращает значение и позицию следующего байта (каждая точка = две
 *  последовательные величины: lat, lng). */
function readSignedValue(
  encoded: string,
  startIndex: number,
): { value: number; nextIndex: number } {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let charCode = 0;
  do {
    charCode = encoded.charCodeAt(index) - 63;
    result |= (charCode & 0x1f) << shift;
    index += 1;
    shift += 5;
  } while (charCode >= 0x20);
  return { value: result & 1 ? ~(result >> 1) : result >> 1, nextIndex: index };
}
