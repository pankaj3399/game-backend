import type { Response } from "express";

type ScoreQrEventClient = {
  id: string;
  response: Response;
};

const clientsByRequestId = new Map<string, Set<ScoreQrEventClient>>();

function sendScoreQrEvent(
  response: Response,
  event: string,
  payload: Record<string, unknown>,
) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function subscribeScoreQrRequestEvents(input: {
  requestId: string;
  response: Response;
  onClose: () => void;
}) {
  const client: ScoreQrEventClient = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    response: input.response,
  };

  let clients = clientsByRequestId.get(input.requestId);
  if (!clients) {
    clients = new Set();
    clientsByRequestId.set(input.requestId, clients);
  }
  clients.add(client);

  sendScoreQrEvent(input.response, "connected", { requestId: input.requestId });

  const heartbeatId = setInterval(() => {
    sendScoreQrEvent(input.response, "heartbeat", { requestId: input.requestId });
  }, 25_000);

  input.response.on("close", () => {
    clearInterval(heartbeatId);
    clients?.delete(client);
    if (clients?.size === 0) {
      clientsByRequestId.delete(input.requestId);
    }
    input.onClose();
  });
}

export function publishScoreQrRequestEvent(
  requestId: string,
  event: string,
  payload: Record<string, unknown> = {},
) {
  const clients = clientsByRequestId.get(requestId);
  if (!clients) return;

  for (const client of clients) {
    sendScoreQrEvent(client.response, event, { requestId, ...payload });
  }
}
