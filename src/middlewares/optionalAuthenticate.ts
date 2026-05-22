import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Session from "../models/Session";
import {
  AUTH_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  extractAuthToken,
  hashSessionToken,
} from "../lib/jwtAuth";
import { logger } from "../lib/logger";

/**
 * Attaches req.user when a valid session token is present; otherwise continues as a guest.
 */
const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractAuthToken(req);
  if (!token) {
    next();
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ message: "Server configuration error" });
    return;
  }

  try {
    jwt.verify(token, secret, {
      audience: AUTH_TOKEN_AUDIENCE,
      issuer: AUTH_TOKEN_ISSUER,
    });

    const session = await Session.findOne({
      $or: [{ token }, { token: hashSessionToken(token) }],
    }).exec();
    if (!session?.user) {
      next();
      return;
    }

    const user = await User.findById(session.user)
      .select("_id email name alias role adminOf organizerOf")
      .exec();
    if (!user) {
      next();
      return;
    }

    req.user = user;
    next();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const authHeader = req.headers.authorization;
    const hasAuthHeader = typeof authHeader === "string" && authHeader.length > 0;
    logger.warn("optionalAuthenticate: invalid session, treating as guest", {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      hasAuthHeader,
      message: err.message,
      stack: err.stack,
    });
    next();
  }
};

export default optionalAuthenticate;
