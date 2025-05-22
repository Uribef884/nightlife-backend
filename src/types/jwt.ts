export type JwtPayload = {
  id: string;
  role: "admin" | "user" | "clubowner" | "bouncer";
  email: string;
  clubId?: string;
};
