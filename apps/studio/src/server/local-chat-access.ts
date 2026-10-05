import { isIP } from "node:net";

function normalize(address: string) {
  return address.startsWith("::ffff:") && isIP(address.slice(7)) === 4
    ? address.slice(7)
    : address;
}

function loopback(address: string) {
  return (
    address === "::1" || (isIP(address) === 4 && address.startsWith("127."))
  );
}

export function localChatPeer(
  peer: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!peer) return false;
  const address = normalize(peer);
  if (loopback(address)) return true;
  // The container launcher supplies its exact gateway only when Compose's
  // published host port is loopback-only. Host/Origin are still checked upstream.
  const bind = environment.SYNKINEMA_PUBLISHED_BIND_HOST || "";
  const gateway = environment.SYNKINEMA_AGENT_CHAT_PROXY_PEER;
  return (
    loopback(bind) &&
    !!gateway &&
    isIP(gateway) !== 0 &&
    address === normalize(gateway)
  );
}
