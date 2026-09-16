// getRandomValues is available on LAN HTTP; randomUUID requires a secure context.
export const createId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
