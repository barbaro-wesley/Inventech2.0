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
    let message = 'Erro interno do servidor'
    let error = 'Internal Server Error'

    // ── Exceções HTTP do NestJS ──
    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const res = exception.getResponse()
      message = typeof res === 'string' ? res : (res as any).message
      error = exception.message
    }

    // ── Erros do Prisma ──
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT
          message = 'Registro já existe com esses dados'
          error = 'Conflict'
          break
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
        default:
          this.logger.error(`Prisma Error ${exception.code}: ${exception.message}`)
      }
    }

    // ── Erros desconhecidos ──
    else {
      this.logger.error('Exceção não tratada:', exception)
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    })
  }
}