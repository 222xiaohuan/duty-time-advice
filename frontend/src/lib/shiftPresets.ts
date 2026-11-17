export type ShiftPreset = {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  endDayOffset: 0 | 1;
  color: string;
};

// Demo 班次清单；正式产品应从班次主数据读取。
export const shiftPresets: ShiftPreset[] = [
  { code: "M0700", name: "早班", startTime: "07:00", endTime: "15:00", endDayOffset: 0, color: "#47759b" },
  { code: "D0900", name: "工作班", startTime: "09:00", endTime: "17:00", endDayOffset: 0, color: "#386b90" },
  { code: "R1100", name: "赛日班", startTime: "11:00", endTime: "18:00", endDayOffset: 0, color: "#5d8a78" },
  { code: "A1200", name: "中班", startTime: "12:00", endTime: "20:00", endDayOffset: 0, color: "#6f8199" },
  { code: "E1700", name: "夜马日班", startTime: "17:00", endTime: "23:30", endDayOffset: 0, color: "#806e95" },
  { code: "N2200", name: "跨午夜班", startTime: "22:00", endTime: "02:00", endDayOffset: 1, color: "#53637f" },
  { code: "OFF", name: "休息", startTime: "00:00", endTime: "00:00", endDayOffset: 0, color: "#a9b4bd" },
];
