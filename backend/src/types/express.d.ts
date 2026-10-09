export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  [key: string]: any;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
