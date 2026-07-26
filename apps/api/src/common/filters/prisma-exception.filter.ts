import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Response } from "express";

/**
 * Maps known Prisma/Postgres errors to typed HTTP responses.
 * - P2002 (unique constraint)      -> 409 CONFLICT
 * - P2025 (record not found)       -> 404 NOT_FOUND
 * - 23P01 (exclusion violation)    -> 422 TIME_ENTRY_OVERLAP
 * - 23514 (check constraint)       -> 422 CHECK_CONSTRAINT_VIOLATION
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientValidationError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request payload" },
      });
      return;
    }

    const meta = exception.meta as Record<string, unknown> | undefined;

    switch (exception.code) {
      case "P2002":
        response.status(HttpStatus.CONFLICT).json({
          error: {
            code: "UNIQUE_CONSTRAINT_VIOLATION",
            message: "A record with these unique fields already exists",
            details: meta,
          },
        });
        return;
      case "P2025":
        response.status(HttpStatus.NOT_FOUND).json({
          error: { code: "NOT_FOUND", message: "Record not found", details: meta },
        });
        return;
      default: {
        // Raw Postgres error codes surface here for constraint violations Prisma doesn't type.
        const rawCode = (exception.meta as any)?.code ?? this.extractPgCode(exception.message);
        if (rawCode === "23P01") {
          response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
            error: { code: "TIME_ENTRY_OVERLAP", message: "This time range overlaps an existing entry" },
          });
          return;
        }
        if (rawCode === "23514") {
          response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
            error: { code: "CHECK_CONSTRAINT_VIOLATION", message: "The data violates a database constraint" },
          });
          return;
        }
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: { code: "DATABASE_ERROR", message: "An unexpected database error occurred" },
        });
      }
    }
  }

  private extractPgCode(message: string): string | undefined {
    const match = /code:\s*"([0-9A-Z]+)"/.exec(message);
    return match?.[1];
  }
}
