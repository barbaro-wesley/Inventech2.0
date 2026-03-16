import { RecurrenceType } from '@prisma/client'

/**
 * Calcula a próxima data de execução baseada no tipo de recorrência.
 * Sempre usa a data atual como base para evitar acúmulo de atrasos.
 */
export function calculateNextRunAt(
    recurrenceType: RecurrenceType,
    from: Date = new Date(),
    customIntervalDays?: number,
): Date {
    const next = new Date(from)

    switch (recurrenceType) {
        case RecurrenceType.DAILY:
            next.setDate(next.getDate() + 1)
            break

        case RecurrenceType.WEEKLY:
            next.setDate(next.getDate() + 7)
            break

        case RecurrenceType.BIWEEKLY:
            next.setDate(next.getDate() + 14)
            break

        case RecurrenceType.MONTHLY:
            next.setMonth(next.getMonth() + 1)
            break

        case RecurrenceType.QUARTERLY:
            next.setMonth(next.getMonth() + 3)
            break

        case RecurrenceType.SEMIANNUAL:
            next.setMonth(next.getMonth() + 6)
            break

        case RecurrenceType.ANNUAL:
            next.setFullYear(next.getFullYear() + 1)
            break

        case RecurrenceType.CUSTOM:
            if (!customIntervalDays || customIntervalDays < 1) {
                throw new Error('customIntervalDays é obrigatório para recorrência CUSTOM')
            }
            next.setDate(next.getDate() + customIntervalDays)
            break

        default:
            throw new Error(`Tipo de recorrência desconhecido: ${recurrenceType}`)
    }

    // Normaliza para início do dia
    next.setHours(8, 0, 0, 0)

    return next
}

/**
 * Retorna um label legível para o tipo de recorrência
 */
export function recurrenceLabel(type: RecurrenceType, customDays?: number): string {
    const labels: Record<RecurrenceType, string> = {
        DAILY: 'Diária',
        WEEKLY: 'Semanal',
        BIWEEKLY: 'Quinzenal',
        MONTHLY: 'Mensal',
        QUARTERLY: 'Trimestral',
        SEMIANNUAL: 'Semestral',
        ANNUAL: 'Anual',
        CUSTOM: `A cada ${customDays} dia(s)`,
    }
    return labels[type] ?? type
}