import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message: string | string[] = 'Erro interno do servidor'
    let error = 'Internal Server Error'
    let extra: Record<string, any> = {}

    // ── Exceções HTTP do NestJS (inclui 429 do rate limit) ──
    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const res = exception.getResponse()

      if (typeof res === 'string') {
        message = res
        error = res
      } else if (typeof res === 'object') {
        const resObj = res as any
        message = resObj.message ?? 'Erro desconhecido'
        error = resObj.error ?? exception.message

        // Campos extras do rate limit
        if (resObj.retryAfter) extra.retryAfter = resObj.retryAfter
      }
    }

    // ── Erros do Prisma ──
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT
          const fields = (exception.meta?.target as string[])?.join(', ')
          message = fields
            ? `Já existe um registro com este(s) valor(es): ${fields}`
            : 'Registro duplicado'
          error = 'Conflict'
          break
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND
          message = 'Registro não encontrado'
          error = 'Not Found'
          break
        case 'P2003':
          status = HttpStatus.BAD_REQUEST
          message = 'Referência inválida — registro relacionado não existe'
          error = 'Bad Request'
          break
        case 'P2014':
          status = HttpStatus.BAD_REQUEST
          message = 'A operação violaria uma relação obrigatória'
          error = 'Bad Request'
          break
        default:
          this.logger.error(`Prisma Error ${exception.code}: ${exception.message}`)
          message = 'Erro ao acessar o banco de dados'
          error = 'Database Error'
      }
    }

    // ── Erros de validação do class-validator ──
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST
      message = 'Dados inválidos enviados ao banco'
      error = 'Validation Error'
      this.logger.error('Prisma Validation Error:', exception.message)
    }

    // ── Erros desconhecidos ──
    else {
      this.logger.error('Exceção não tratada:', exception)
      // Em produção não expõe detalhes do erro
      if (process.env.NODE_ENV !== 'production') {
        extra.detail = exception instanceof Error ? exception.message : String(exception)
      }
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...extra,
    })
  }
}