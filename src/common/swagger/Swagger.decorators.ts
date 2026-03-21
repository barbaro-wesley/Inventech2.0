import { applyDecorators, HttpStatus } from '@nestjs/common'
import {
    ApiResponse,
    ApiUnauthorizedResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiBadRequestResponse,
    ApiTooManyRequestsResponse,
    ApiConsumes,
} from '@nestjs/swagger'

// ─────────────────────────────────────────
// Respostas de erro padrão reutilizáveis
// ─────────────────────────────────────────

export const ApiErrorResponses = () =>
    applyDecorators(
        ApiUnauthorizedException(),
        ApiForbiddenException(),
        ApiBadRequestException(),
        ApiRateLimitException(),
    )

export const ApiUnauthorizedException = () =>
    ApiUnauthorizedResponse({
        description: 'Não autenticado — token ausente, inválido ou expirado',
        schema: {
            example: {
                success: false,
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Credenciais inválidas',
                timestamp: '2026-03-21T12:00:00.000Z',
                path: '/api/v1/auth/login',
            },
        },
    })

export const ApiForbiddenException = () =>
    ApiForbiddenResponse({
        description: 'Sem permissão para acessar este recurso',
        schema: {
            example: {
                success: false,
                statusCode: 403,
                error: 'Forbidden',
                message: 'Você não tem permissão para realizar esta ação',
                timestamp: '2026-03-21T12:00:00.000Z',
                path: '/api/v1/clients',
            },
        },
    })

export const ApiBadRequestException = () =>
    ApiBadRequestResponse({
        description: 'Dados inválidos na requisição',
        schema: {
            example: {
                success: false,
                statusCode: 400,
                error: 'Bad Request',
                message: ['email must be an email', 'password must be longer than or equal to 6 characters'],
                timestamp: '2026-03-21T12:00:00.000Z',
                path: '/api/v1/auth/login',
            },
        },
    })

export const ApiNotFoundException = () =>
    ApiNotFoundResponse({
        description: 'Recurso não encontrado',
        schema: {
            example: {
                success: false,
                statusCode: 404,
                error: 'Not Found',
                message: 'Registro não encontrado',
                timestamp: '2026-03-21T12:00:00.000Z',
                path: '/api/v1/clients/uuid-invalido',
            },
        },
    })

export const ApiRateLimitException = () =>
    ApiTooManyRequestsResponse({
        description: 'Rate limit atingido — muitas requisições em pouco tempo',
        schema: {
            example: {
                success: false,
                statusCode: 429,
                error: 'Too Many Requests',
                message: 'Muitas tentativas de login. Aguarde 45 segundos.',
                retryAfter: 45,
                timestamp: '2026-03-21T12:00:00.000Z',
                path: '/api/v1/auth/login',
            },
        },
    })

// ─────────────────────────────────────────
// Resposta paginada genérica
// ─────────────────────────────────────────
export const ApiPaginatedResponse = (description: string, dataExample: any) =>
    ApiResponse({
        status: HttpStatus.OK,
        description,
        schema: {
            example: {
                success: true,
                statusCode: 200,
                data: [dataExample],
                pagination: {
                    total: 1,
                    page: 1,
                    limit: 20,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPrevPage: false,
                },
                timestamp: '2026-03-21T12:00:00.000Z',
            },
        },
    })

// ─────────────────────────────────────────
// Resposta de objeto simples
// ─────────────────────────────────────────
export const ApiObjectResponse = (description: string, dataExample: any) =>
    ApiResponse({
        status: HttpStatus.OK,
        description,
        schema: {
            example: {
                success: true,
                statusCode: 200,
                data: dataExample,
                timestamp: '2026-03-21T12:00:00.000Z',
            },
        },
    })

// ─────────────────────────────────────────
// Resposta de criação (201)
// ─────────────────────────────────────────
export const ApiCreatedResponse = (description: string, dataExample: any) =>
    ApiResponse({
        status: HttpStatus.CREATED,
        description,
        schema: {
            example: {
                success: true,
                statusCode: 201,
                data: dataExample,
                timestamp: '2026-03-21T12:00:00.000Z',
            },
        },
    })

// ─────────────────────────────────────────
// Upload multipart/form-data
// ─────────────────────────────────────────
export const ApiMultipartForm = () =>
    ApiConsumes('multipart/form-data')