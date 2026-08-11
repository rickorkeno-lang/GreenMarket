import type { DurationVm } from "../presentation/DurationVm";

/** Длительность поездки для карточки продавца (MAP-020), по образцу
 *  DistanceFormatter: < 1 мин — «меньше минуты», < 1 ч — «N мин», дальше —
 *  «N ч MM мин» (минуты дополняются нулём слева, как в навигации). */
export const DurationFormatter = {
  format(vm: DurationVm): string {
    const totalMinutes = Math.max(0, Math.round(vm.seconds / 60));
    if (totalMinutes < 1) return "меньше минуты";
    if (totalMinutes < 60) return `${totalMinutes} мин`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours} ч` : `${hours} ч ${String(minutes).padStart(2, "0")} мин`;
  },
};
