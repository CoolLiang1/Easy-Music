export type LoginRequest = {
  username: string;
  password: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: "bearer" | string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_at: string;
};

export type CurrentUser = {
  id: number;
  username: string;
  created_at: string;
};

export type LogoutResponse = {
  status: string;
};
