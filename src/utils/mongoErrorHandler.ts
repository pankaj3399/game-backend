/* eslint-disable @typescript-eslint/no-explicit-any */
// handle email or username duplicates
const handleDuplicateKeyError = (err: any) => {
  const field = Object.keys(err.keyValue);
  const messages = field?.map((item) => `${item} already exists`);
  return {
    field,
    errorType: "duplication",
    messages,
    status: 409, // conflicts
  };
};
// handle field formatting, empty fields, and mismatched passwords
const handleValidationError = (err: any) => {
  const errors = Object.values(err.errors).map((el: any) => el.message);
  const fields = Object.values(err.errors).map((el: any) => el.path);
  return {
    messages: errors,
    field: fields,
    status: 400,
    errorType: "validation",
    missing: `Missing! ${fields}`,
  }; // Validation error
};
const mongoErrorHandler = (err: any) => {
  try {
    if (err.name === "ValidationError")
      return (err = handleValidationError(err));
    if (err.code && err.code == 11000)
      return (err = handleDuplicateKeyError(err));
  } catch (err: any) {
    const message = err?.message ?? "Server error";
    return {
      field: "unknown",
      messages: [message],
      status: 500,
    };
  }
};

export default mongoErrorHandler;
