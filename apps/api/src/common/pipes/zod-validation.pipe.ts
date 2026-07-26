import { ArgumentMetadata, BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodTypeAny } from "zod";

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}
