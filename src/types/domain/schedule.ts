export const SCHEDULE_STATUSES = ['draft', 'active', 'finished'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
