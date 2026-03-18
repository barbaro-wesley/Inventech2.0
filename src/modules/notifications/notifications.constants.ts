// ─────────────────────────────────────────
// Fila de notificações
// ─────────────────────────────────────────
export const NOTIFICATION_QUEUE = 'notifications'

// ─────────────────────────────────────────
// Eventos que disparam notificações
// ─────────────────────────────────────────
export const NOTIFICATION_EVENTS = {
    // OS
    OS_CREATED_NO_TECHNICIAN: 'os.created.no_technician',    // OS criada sem técnico → painel
    OS_TECHNICIAN_ASSIGNED: 'os.technician.assigned',         // Técnico designado
    OS_TECHNICIAN_ASSUMED: 'os.technician.assumed',           // Técnico assumiu do painel
    OS_COMPLETED: 'os.completed',                             // OS concluída → aguarda aprovação
    OS_APPROVED: 'os.approved',                               // OS aprovada
    OS_REJECTED: 'os.rejected',                               // OS reprovada
    OS_UNASSIGNED_ALERT: 'os.unassigned.alert',               // OS sem técnico há X horas
    // Manutenção
    PREVENTIVE_GENERATED: 'maintenance.preventive.generated', // Preventiva gerada pelo cron
    // Relatório
    DAILY_SUMMARY: 'report.daily.summary',                    // Resumo diário de OS abertas
} as const

export type NotificationEvent = typeof NOTIFICATION_EVENTS[keyof typeof NOTIFICATION_EVENTS]

// ─────────────────────────────────────────
// Quem recebe cada evento
// ─────────────────────────────────────────
export const EVENT_RECIPIENTS = {
    [NOTIFICATION_EVENTS.OS_CREATED_NO_TECHNICIAN]: ['group_technicians', 'company_managers'],
    [NOTIFICATION_EVENTS.OS_TECHNICIAN_ASSIGNED]: ['technician'],
    [NOTIFICATION_EVENTS.OS_TECHNICIAN_ASSUMED]: ['requester', 'company_managers'],
    [NOTIFICATION_EVENTS.OS_COMPLETED]: ['requester', 'company_managers', 'client_admins'],
    [NOTIFICATION_EVENTS.OS_APPROVED]: ['technicians'],
    [NOTIFICATION_EVENTS.OS_REJECTED]: ['technicians', 'company_managers'],
    [NOTIFICATION_EVENTS.OS_UNASSIGNED_ALERT]: ['group_technicians', 'company_managers'],
    [NOTIFICATION_EVENTS.PREVENTIVE_GENERATED]: ['company_managers', 'group_technicians'],
    [NOTIFICATION_EVENTS.DAILY_SUMMARY]: ['company_admins', 'company_managers'],
} as const