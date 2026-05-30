import jwt from "jsonwebtoken";

type AdminTokenPayload = {
  userId: number;
  login: string;
  roleCode: string;
};

type MobileTokenPayload = {
  mobileUserId: number;
  login: string;
  cityId: number;
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined in .env");
  }

  return secret;
}

export function signAdminToken(payload: AdminTokenPayload) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "7d",
  });
}

export function verifyAdminToken(token: string) {
  return jwt.verify(token, getJwtSecret()) as AdminTokenPayload;
}

export function signMobileToken(payload: MobileTokenPayload) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "30d",
  });
}

export function verifyMobileToken(token: string) {
  return jwt.verify(token, getJwtSecret()) as MobileTokenPayload;
}