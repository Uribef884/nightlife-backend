import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { Club } from "../entities/Club";
import { AuthenticatedRequest } from "../types/express";
import bcrypt from "bcrypt";

export const createBouncer = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { email, password } = req.body;
  const userRepo = AppDataSource.getRepository(User);
  const clubRepo = AppDataSource.getRepository(Club);
  const requester = req.user;

  if (!email || !password) {
    res.status(400).json({ error: "Missing email or password" });
    return;
  }

  if (!requester || (requester.role !== "admin" && requester.role !== "clubowner")) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const existing = await userRepo.findOneBy({ email });
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  let clubId: string;

  if (requester.role === "admin") {
    clubId = req.body.clubId;
    if (!clubId) {
      res.status(400).json({ error: "Missing clubId for bouncer" });
      return;
    }
  } else {
    const club = await clubRepo.findOneBy({ ownerId: requester.id });
    if (!club) {
      res.status(403).json({ error: "You don't own a club" });
      return;
    }
    clubId = club.id;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newBouncer = userRepo.create({
    email,
    password: hashedPassword,
    role: "bouncer",
    clubId,
  });

  await userRepo.save(newBouncer);
  res.status(201).json({ message: "Bouncer created", bouncer: newBouncer });
};

export const getBouncers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userRepo = AppDataSource.getRepository(User);
  const requester = req.user;

  if (!requester || (requester.role !== "admin" && requester.role !== "clubowner")) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  let clubId: string;

  if (requester.role === "admin") {
    clubId = req.query.clubId as string;
    if (!clubId) {
      res.status(400).json({ error: "Missing clubId" });
      return;
    }
  } else {
    const club = await AppDataSource.getRepository(Club).findOneBy({ ownerId: requester.id });
    if (!club) {
      res.status(403).json({ error: "You don't own a club" });
      return;
    }
    clubId = club.id;
  }

  const bouncers = await userRepo.find({
    where: { role: "bouncer", clubId },
    select: ["id", "email", "createdAt"],
  });

  res.json(bouncers);
};

export const deleteBouncer = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const userRepo = AppDataSource.getRepository(User);
  const requester = req.user;

  const bouncer = await userRepo.findOneBy({ id, role: "bouncer" });
  if (!bouncer) {
    res.status(404).json({ error: "Bouncer not found" });
    return;
  }

  const isAdmin = requester?.role === "admin";
  const ownerClub = await AppDataSource.getRepository(Club).findOneBy({ ownerId: requester!.id });
  const isOwner = requester?.role === "clubowner" && bouncer.clubId === ownerClub?.id;

  if (!isAdmin && !isOwner) {
    res.status(403).json({ error: "You are not authorized to delete this bouncer" });
    return;
  }

  await userRepo.remove(bouncer);
  res.status(200).json({ message: "Bouncer deleted successfully" });
};
