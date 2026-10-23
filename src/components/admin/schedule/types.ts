/** Frontend boundary. No default hours, fixtures, or persistence. */
export type ScheduleDraft = { enabled: boolean; startTime: string; cutoffTime: string; openWeekdays: number[]; closedDates: string[]; bookingHorizonDays: string };
export type ScheduleSnapshot = { branchId: string; revision: string; values: ScheduleDraft; canEdit: boolean; canEditBookingWindow: boolean; updatedAt: string; hoursLabel: string | null };
export type ScheduleResource =
 | { status: 'unconnected' | 'loading' | 'error' | 'forbidden'; message?: string }
 | { status: 'ready'; snapshot: ScheduleSnapshot; freshness: 'current' | 'refreshing' | 'stale' | 'offline' };
export type ScheduleCommand = { branchId: string; expectedRevision: string; schedule: Omit<ScheduleDraft,'bookingHorizonDays'>; bookingHorizonDays?: number };
export type ScheduleResult = { ok: true; snapshot: ScheduleSnapshot } | { ok: false; kind: 'validation' | 'conflict' | 'permission' | 'network'; message: string };
export type ScheduleAdapter = { onRefresh?: () => void; onSave?: (command: ScheduleCommand) => Promise<ScheduleResult> };
