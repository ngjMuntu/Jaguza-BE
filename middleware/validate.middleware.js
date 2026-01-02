const { validationResult } = require('express-validator');

exports.validate = (schemas) => {
  return async (req, res, next) => {
    await Promise.all(schemas.map(schema => schema.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  };
};