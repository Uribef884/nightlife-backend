export type JwtPayload = {
  id: string;
  role: "admin" | "user" | "clubowner" | "bouncer" | "waiter";
  email: string;
  clubId?: string;
};
