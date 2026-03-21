import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

// ─────────────────────────────────────────────────────────────────────────────
// Formato padrão de resposta com paginação
// ─────────────────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
    data: T[]
    pagination: {
        total: number
        page: number
        limit: number
        totalPages: number
        hasNextPage: boolean
        hasPrevPage: boolean
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formato padrão de resposta da API
// ─────────────────────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
    success: boolean
    statusCode: number
    data: T | null
    message?: string
    pagination?: PaginatedResponse<any>['pagination']
    timestamp: string
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
        const response = context.switchToHttp().getResponse()
        const statusCode = response.statusCode

        return next.handle().pipe(
            map((result) => {
                // Se o endpoint retornar null ou undefined
                if (result === null || result === undefined) {
                    return {
                        success: true,
                        statusCode,
                        data: null,
                        timestamp: new Date().toISOString(),
                    }
                }

                // ── Detecta resposta paginada ──────────────────────────────────────
                // Services retornam: { data: [...], total, page, limit }
                if (
                    typeof result === 'object' &&
                    'data' in result &&
                    'total' in result &&
                    'page' in result &&
                    'limit' in result &&
                    Array.isArray(result.data)
                ) {
                    const { data, total, page, limit } = result
                    const totalPages = Math.ceil(total / limit)

                    return {
                        success: true,
                        statusCode,
                        data,
                        pagination: {
                            total,
                            page,
                            limit,
                            totalPages,
                            hasNextPage: page < totalPages,
                            hasPrevPage: page > 1,
                        },
                        timestamp: new Date().toISOString(),
                    }
                }

                // ── Detecta resposta de mensagem simples ───────────────────────────
                // Ex: { message: 'Removido com sucesso' }
                if (
                    typeof result === 'object' &&
                    Object.keys(result).length === 1 &&
                    'message' in result
                ) {
                    return {
                        success: true,
                        statusCode,
                        data: null,
                        message: result.message,
                        timestamp: new Date().toISOString(),
                    }
                }

                // ── Resposta padrão ────────────────────────────────────────────────
                return {
                    success: true,
                    statusCode,
                    data: result,
                    timestamp: new Date().toISOString(),
                }
            }),
        )
    }
}