/**
 * Generic Zod validation middleware.
 * Usage: router.post('/login', validate(loginSchema), handler)
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => i.message);
    return res.status(400).json({ message: errors[0], errors });
  }
  // Replace body with parsed (coerced/trimmed) data
  req.body = result.data;
  next();
};
