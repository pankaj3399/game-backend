import { z } from "zod";
import mongoose from "mongoose";

export type ValidationSuccess<T> = { ok: true; value: T };
export type ValidationFailure = { ok: false; status: number; message: string };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export const nonEmptyString = z.string().trim().min(1);

export const objectId = nonEmptyString.refine(
  (value) => mongoose.Types.ObjectId.isValid(value),
  { message: "Invalid ObjectId" }
);

export function objectIdFor(fieldName: string = "ID") {
  return nonEmptyString.refine(
    (value) => mongoose.Types.ObjectId.isValid(value),
    { message: `Invalid ${fieldName}` }
  );
}

export function idParamSchema(fieldName: string = "ID") {
  return z.object({
    id: objectIdFor(fieldName),
  });
}