import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

import { ErrorCode, ErrorMessage } from '@/shared/constants/error-code';
import { requestContext } from '@/shared/context/request-context';
import { ApiResponse } from '@/shared/types/auth-user';

interface ErrorBody {
  code?: number;
  message?: string | string[];
}

/** 全局异常兜底：统一错误响应结构，未知异常记录完整堆栈 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const traceId = requestContext.traceId ?? request.id;

    const { status, code, message } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `[${traceId}] ${request.method} ${request.url} ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${traceId}] ${request.method} ${request.url} -> ${code} ${message}`);
    }

    const body: ApiResponse<null> = {
      code,
      message,
      data: null,
      traceId,
      timestamp: Date.now(),
    };
    response.status(status).json(body);
  }

  private resolve(exception: unknown): { status: number; code: number; message: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as ErrorBody;
      const message = Array.isArray(body.message) ? body.message.join('；') : body.message;
      return {
        status,
        code: body.code ?? status,
        message: message ?? exception.message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: '数据已存在（唯一约束冲突）',
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: ErrorMessage[ErrorCode.NOT_FOUND],
        };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
        message: ErrorMessage[ErrorCode.BAD_REQUEST],
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: ErrorMessage[ErrorCode.INTERNAL_ERROR],
    };
  }
}
