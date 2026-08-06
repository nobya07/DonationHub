import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCollector, setCollectorSessionId } from "./utils/sheets.js";
import {
  createSessionId,
  createSessionToken,
  createSessionCookie,
} from "./utils/session.js";
import {
  applyCorsHeaders,
  isCrossOriginRequest,
  sendCorsPreflight,
} from "./utils/cors.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (sendCorsPreflight(req, res)) return;
  applyCorsHeaders(req, res);

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    const collector = await getCollector(username);

    if (!collector) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    if (!collector.active) {
      return res.status(403).json({
        message: "Collector account is inactive",
      });
    }

    // Plain-text password check
    if (collector.password !== password) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    // New session id replaces any previous login on other devices, making
    // the old device's session invalid immediately.
    const sessionId = createSessionId();

    await setCollectorSessionId(collector.collectorId, sessionId);

    const token = createSessionToken({
      collectorId: collector.collectorId,
      username: collector.username,
      collectorName: collector.collectorName,
      role: collector.role,
      sessionId,
    });

    res.setHeader("Set-Cookie", createSessionCookie(token, isCrossOriginRequest(req)));

    return res.status(200).json({
      collectorId: collector.collectorId,
      username: collector.username,
      collectorName: collector.collectorName,
      role: collector.role,
      sessionId,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}