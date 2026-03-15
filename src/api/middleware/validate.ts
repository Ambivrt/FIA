import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const zodError = result.error as ZodError;
      res.status(400).json({
        error: {
          code: "VALIDATION",
          message: zodError.issues[0].message,
          details: zodError.issues,
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
