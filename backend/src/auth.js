import crypto from "crypto";

const TOKEN_SECRET = process.env.TOKEN_SECRET || "controle-veiculos-local-secret";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hashed = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hashed}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, original] = storedHash.split(":");
  const hashed = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(original, "hex"), Buffer.from(hashed, "hex"));
}

export function signToken(user) {
  const payload = {
    sub: user.id,
    role: user.role,
    name: user.fullName,
    username: user.username,
    exp: Date.now() + 1000 * 60 * 60 * 12
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyToken(token) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    throw new Error("Token invalido.");
  }

  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(encoded).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Assinatura invalida.");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  if (payload.exp < Date.now()) {
    throw new Error("Sessao expirada.");
  }

  return payload;
}
