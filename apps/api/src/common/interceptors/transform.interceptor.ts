import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<Envelope<T>> {
    return next.handle().pipe(
      map((result) => {
        if (result && typeof result === "object" && ("data" in result || "meta" in result)) {
          return result as Envelope<T>;
        }
        return { data: result };
      }),
    );
  }
}
