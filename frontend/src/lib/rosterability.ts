import { BaselineRule, RosterabilityStatus } from "./enums";

export function baselineStatusMessage(baselineRule: string | null | undefined, statusCode: string): string | null {
  if (baselineRule === BaselineRule.BASE_UNROSTERABLE && statusCode === RosterabilityStatus.UNROSTERABLE) {
    return "已默认全部不可排，无需维护不可排时间";
  }
  if (baselineRule === BaselineRule.BASE_ROSTERABLE && statusCode === RosterabilityStatus.ROSTERABLE) {
    return "已默认全部可排，无需维护可排时间";
  }
  return null;
}
