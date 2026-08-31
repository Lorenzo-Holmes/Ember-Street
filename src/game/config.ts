export const CHAPTER_FINAL_DAY = 30;
export const FINAL_PLAYABLE_DAY = 29;
export const HORDE_MILESTONE_DAYS = [10, 20, 29] as const;

export function isHordeMilestone(day: number): boolean {
  return HORDE_MILESTONE_DAYS.includes(day as (typeof HORDE_MILESTONE_DAYS)[number]);
}

export function nightEventTotalFor(day: number, hordeActive: boolean): number {
  if (day >= CHAPTER_FINAL_DAY) return 0;
  return hordeActive || isHordeMilestone(day) ? 6 : 5;
}
