import { Request, Response, NextFunction } from "express";

export interface DnsRebindingOptions {
  allowedHosts: string[];
}

/**
 * Middleware that validates the Host header to prevent DNS rebinding attacks.
 * Rejects requests whose Host header does not match the configured allowed values.
 */
export function dnsRebindingProtection(options: DnsRebindingOptions) {
  const hostSet = new Set(options.allowedHosts.map((h) => h.toLowerCase()));

  return (req: Request, res: Response, next: NextFunction): void => {
    const host = req.headers.host?.toLowerCase();
    if (host && !hostSet.has(host)) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Invalid Host header." },
      });
      return;
    }

    next();
  };
}
